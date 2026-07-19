"use client";

import { getHostedApiBaseUrl } from "@/lib/hostedApiBase";
import { supabase } from "@/lib/supabaseClient";

export type MessagePushType = "direct_message" | "group_message" | "room_message" | "room_mention";

/**
 * Immediately ask the hosted API to deliver FCM/APNs for a just-inserted message.
 * Works while the recipient app is backgrounded or killed (does not use realtime).
 * Uses /api/push/send (same route as the DB webhook) with the sender JWT.
 *
 * Payload shape: `{ messageId: string, type: MessagePushType }`
 * Call sites may pass numeric DB ids; we coerce with String() before JSON.stringify.
 */
export function requestMessagePush(input: { messageId: string | number; type: MessagePushType }) {
  const messageId =
    typeof input.messageId === "string" || typeof input.messageId === "number"
      ? String(input.messageId).trim()
      : "";

  if (!messageId) {
    console.error("[Push][step 1] FAIL requestMessagePush — missing messageId", {
      typeofMessageId: typeof input.messageId,
      messageId: input.messageId,
    });
    return;
  }

  console.info("[Push][step 1] DM/message created — calling hosted /api/push/send", {
    messageId,
    typeofMessageId: typeof input.messageId,
    type: input.type,
  });

  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error("[Push][step 1] FAIL requestMessagePush skipped — no session", {
          messageId,
          type: input.type,
        });
        return;
      }

      const base = getHostedApiBaseUrl();
      const url = `${base}/api/push/send`;
      const body = {
        messageId,
        type: input.type,
      };

      console.info("[Push][step 2] POST /api/push/send", {
        url,
        body,
        typeofMessageId: typeof body.messageId,
        senderUserId: session.user.id,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => null)) as {
        fcmSent?: number;
        successCount?: number;
        failureCount?: number;
        skipped?: string;
        chainStage?: string;
        error?: string;
        results?: Array<{
          skipped?: string;
          userId?: string;
          notificationUserId?: string;
          recipientResolution?: {
            senderUserId?: string | null;
            recipientUserId?: string | null;
            conversationParticipants?: string[];
            tokenQueryUserId?: string;
            tokenQueryMatchesIphoneTokenOwner?: boolean;
            iphoneTokenOwnerUserIds?: string[];
            tokenQueryIsSender?: boolean;
          };
        }>;
        recipients?: number;
      } | null;

      if (!response.ok) {
        console.error("[Push][step 2] FAIL /api/push/send HTTP error", {
          messageId,
          type: input.type,
          status: response.status,
          error: payload?.error ?? null,
          chainStage: payload?.chainStage ?? "api_error",
          payload,
        });
        return;
      }

      console.info("[Push][step 2] /api/push/send response", {
        messageId,
        type: input.type,
        fcmSent: payload?.fcmSent ?? 0,
        successCount: payload?.successCount ?? null,
        failureCount: payload?.failureCount ?? null,
        skipped: payload?.skipped ?? null,
        chainStage: payload?.chainStage ?? null,
        recipients: payload?.recipients ?? null,
        results: payload?.results ?? null,
      });

      for (const row of payload?.results ?? []) {
        const resolution = row.recipientResolution;
        if (!resolution) continue;
        console.info("[Push][step 3] DM recipient resolution", {
          messageId,
          sender_user_id: resolution.senderUserId,
          recipient_user_id: resolution.recipientUserId,
          conversation_participants: resolution.conversationParticipants,
          token_query_user_id: resolution.tokenQueryUserId,
          notification_user_id: row.notificationUserId,
          token_query_is_sender: resolution.tokenQueryIsSender,
          token_query_matches_iphone_token_owner: resolution.tokenQueryMatchesIphoneTokenOwner,
          iphone_token_owner_user_ids: resolution.iphoneTokenOwnerUserIds,
          skipped: row.skipped ?? null,
        });
      }
    } catch (error) {
      console.error("[Push][step 2] FAIL requestMessagePush network error", {
        messageId,
        type: input.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
