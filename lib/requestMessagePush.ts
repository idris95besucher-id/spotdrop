"use client";

import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import { supabase } from "@/lib/supabaseClient";

export type MessagePushType = "direct_message" | "group_message" | "room_message" | "room_mention";

/**
 * Immediately ask the hosted API to deliver FCM/APNs for a just-inserted message.
 * Works while the recipient app is backgrounded or killed (does not use realtime).
 */
export function requestMessagePush(input: { messageId: string; type: MessagePushType }) {
  if (!input.messageId) {
    return;
  }

  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.warn("[Push] requestMessagePush skipped — no session", input);
        return;
      }

      const base = getHostedApiBaseUrl();
      const response = await fetch(`${base}/api/push/notify-message`, {
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
        skipped?: string;
        chainStage?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        console.error("[Push] requestMessagePush failed", {
          ...input,
          status: response.status,
          error: payload?.error ?? null,
          chainStage: payload?.chainStage ?? "api_error",
        });
        return;
      }

      console.info("[Push] requestMessagePush ok", {
        ...input,
        fcmSent: payload?.fcmSent ?? 0,
        skipped: payload?.skipped ?? null,
        chainStage: payload?.chainStage ?? null,
      });
    } catch (error) {
      console.error("[Push] requestMessagePush network error", {
        ...input,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
