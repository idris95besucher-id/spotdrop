import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";

/**
 * Must stay byte-for-byte identical to the EN value of
 * "spotEditor.error.photoRejected" (lib/i18n/extensionMessages.ts) — the
 * publish-error pipeline maps raw English catalog strings back to a
 * translation key by exact match (lib/i18n/localizeUserMessage.ts).
 */
export const SPOT_PHOTO_REJECTED_MESSAGE =
  "This photo is not suitable for Public Spots. Only beautiful or useful places that other people can visit may be shared here. You can post photos of yourself on your private profile.";

export type SpotPhotoModerationResult =
  | { outcome: "place" }
  | { outcome: "person" }
  | { outcome: "uncertain" }
  | { outcome: "error" };

/**
 * Public Spot only — server-side OpenAI vision check for selfies/portraits
 * (app/api/spots/moderate-photo/route.ts). "uncertain" and "error" are both
 * treated as "don't publish, let the user retry" by callers — neither one
 * accuses the user of a violation, only "person" does.
 */
export async function checkSpotPhotoModeration(
  imageUrl: string,
  accessToken: string
): Promise<SpotPhotoModerationResult> {
  try {
    const base = getHostedApiBaseUrl();
    const response = await fetch(`${base}/api/spots/moderate-photo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageUrl }),
    });

    const body = (await response.json().catch(() => null)) as
      | { decision?: string; error?: string }
      | null;

    if (!response.ok) {
      console.error("[spot-photo-moderation] request failed", {
        status: response.status,
        error: body?.error ?? null,
      });
      return { outcome: "error" };
    }

    if (body?.decision === "place" || body?.decision === "person" || body?.decision === "uncertain") {
      return { outcome: body.decision };
    }

    console.error("[spot-photo-moderation] unexpected response shape", body);
    return { outcome: "error" };
  } catch (error) {
    console.error("[spot-photo-moderation] network error", error);
    return { outcome: "error" };
  }
}
