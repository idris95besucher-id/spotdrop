import {
  getFreshAccessToken,
  requireAuthenticatedUser,
  uploadFileToStorageWithProgress,
} from "@/lib/storageUpload";
import { retryUpload, type RetryAttemptInfo } from "@/lib/uploadRetry";
import { supabase } from "@/lib/supabaseClient";

export const CHAT_AUDIO_BUCKET = "chat-audio" as const;

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("webm")) return "webm";

  return "audio";
}

function formatVoiceMessagePath(userId: string, mimeType: string) {
  return `${userId}/voice-${Date.now()}.${extensionForMimeType(mimeType)}`;
}

export type UploadVoiceMessageResult = {
  audioUrl: string | null;
  error: string | null;
};

/**
 * Uploads a recorded voice message Blob to the shared chat-audio bucket. Reuses the same
 * XHR-with-progress + exponential-backoff retry infrastructure already built for Spot media
 * uploads (lib/storageUpload.ts, lib/uploadRetry.ts) — transient network failures retry
 * automatically; auth/permission failures do not.
 */
export async function uploadVoiceMessage(
  userId: string,
  blob: Blob,
  mimeType: string,
  options: {
    onProgress?: (percent: number) => void;
    onRetry?: (info: RetryAttemptInfo) => void;
    signal?: AbortSignal;
  } = {}
): Promise<UploadVoiceMessageResult> {
  await requireAuthenticatedUser(userId);

  const accessToken = await getFreshAccessToken();

  if (!accessToken) {
    return { audioUrl: null, error: "Please sign in to send voice messages." };
  }

  const path = formatVoiceMessagePath(userId, mimeType);

  try {
    await retryUpload(
      (attemptNumber) =>
        uploadFileToStorageWithProgress(CHAT_AUDIO_BUCKET, path, blob, {
          accessToken,
          cacheControl: "3600",
          upsert: false,
          onProgress: options.onProgress,
          signal: options.signal,
          isRetryAttempt: attemptNumber > 1,
        }),
      { signal: options.signal, onRetry: options.onRetry }
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to upload voice message.";
    console.error("[voice-message] upload failed", caught);
    return { audioUrl: null, error: message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(CHAT_AUDIO_BUCKET).getPublicUrl(path);

  return { audioUrl: publicUrl, error: null };
}
