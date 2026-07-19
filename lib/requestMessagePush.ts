"use client";

import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import { supabase } from "@/lib/supabaseClient";

export type MessagePushType = "direct_message" | "group_message" | "room_message" | "room_mention";

/**
 * Immediately ask the hosted API to deliver FCM/APNs for a just-inserted message.
 * Works while the recipient app is backgrounded or killed (does not use realtime).
 * Uses /api/push/send (same route as the DB webhook) with the sender JWT.
 */
export function requestMessagePush(input: { messageId: string; type: MessagePushType }) {
  if (!input.messageId) {
    console.error("[Push][step 1] FAIL requestMessagePush — missing messageId");
    return;
  }

  console.info("[Push][step 1] DM/message created — calling hosted /api/push/send", {
    messageId: input.messageId,
    type: input.type,
  });

  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error("[Push][step 1] FAIL requestMessagePush skipped — no session", input);
        return;
      }

      const base = getHostedApiBaseUrl();
      const url = `${base}/api/push/send`;
      console.info("[Push][step 2] POST /api/push/send", {
        url,
        messageId: input.messageId,
        type: input.type,
        senderUserId: session.user.id,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId: input.messageId,
          type: input.type,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        fcmSent?: number;
        successCount?: number;
        failureCount?: number;
        skipped?: string;
        chainStage?: string;
        error?: string;
        results?: unknown;
        recipients?: number;
      } | null;

      if (!response.ok) {
        console.error("[Push][step 2] FAIL /api/push/send HTTP error", {
          ...input,
          status: response.status,
          error: payload?.error ?? null,
          chainStage: payload?.chainStage ?? "api_error",
          payload,
        });
        return;
      }

      console.info("[Push][step 2] /api/push/send response", {
        ...input,
        fcmSent: payload?.fcmSent ?? 0,
        successCount: payload?.successCount ?? null,
        failureCount: payload?.failureCount ?? null,
        skipped: payload?.skipped ?? null,
        chainStage: payload?.chainStage ?? null,
        recipients: payload?.recipients ?? null,
        results: payload?.results ?? null,
      });
    } catch (error) {
      console.error("[Push][step 2] FAIL requestMessagePush network error", {
        ...input,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
