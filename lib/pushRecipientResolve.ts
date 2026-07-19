import type { NotificationRow } from "@/lib/notifications";
import { pushServerError, pushServerLog } from "@/lib/pushServerLog";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type DmRecipientResolution = {
  messageId: string;
  senderUserId: string | null;
  recipientUserId: string | null;
  conversationParticipants: string[];
  notificationUserId: string;
  notificationActorId: string | null;
  tokenQueryUserId: string;
  dmRowFound: boolean;
  notificationUserMatchesDmRecipient: boolean | null;
  tokenQueryIsSender: boolean;
  tokenOwnerUserIds: string[];
  tokenQueryMatchesAnyTokenOwner: boolean;
  iphoneTokenOwnerUserIds: string[];
  tokenQueryMatchesIphoneTokenOwner: boolean;
};

/**
 * Resolve and log who we will query user_push_tokens for on a DM push.
 * Prefers direct_messages.recipient_id over notifications.user_id when they disagree.
 */
export async function resolveAndLogDmPushRecipient(input: {
  admin: AdminClient;
  messageId: string;
  senderUserId: string;
  notification: NotificationRow;
}): Promise<DmRecipientResolution> {
  const { admin, messageId, senderUserId, notification } = input;

  const { data: dmRow, error: dmError } = await admin
    .from("direct_messages")
    .select("id, sender_id, recipient_id")
    .eq("id", messageId)
    .maybeSingle();

  if (dmError) {
    pushServerError("3", "DM row load failed during recipient resolution", {
      messageId,
      error: dmError.message,
    });
  }

  const dmSenderId = dmRow?.sender_id ? String(dmRow.sender_id) : null;
  const dmRecipientId = dmRow?.recipient_id ? String(dmRow.recipient_id) : null;
  const conversationParticipants = [dmSenderId, dmRecipientId].filter(Boolean) as string[];

  const notificationUserId = notification.user_id;
  const notificationActorId = notification.actor_id;

  // Canonical recipient for a DM is the message recipient_id.
  let tokenQueryUserId = notificationUserId;
  let notificationUserMatchesDmRecipient: boolean | null = null;

  if (dmRecipientId) {
    notificationUserMatchesDmRecipient = notificationUserId === dmRecipientId;
    tokenQueryUserId = dmRecipientId;

    if (!notificationUserMatchesDmRecipient) {
      pushServerError("3", "notifications.user_id !== direct_messages.recipient_id — using DM recipient for token query", {
        messageId,
        notificationUserId,
        dmRecipientId,
        notificationActorId,
        senderUserId,
      });
    }
  }

  const { data: tokenRows, error: tokenListError } = await admin
    .from("user_push_tokens")
    .select("user_id, platform, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (tokenListError) {
    pushServerError("3", "Failed listing user_push_tokens owners for comparison", {
      error: tokenListError.message,
    });
  }

  const tokenOwnerUserIds = [...new Set((tokenRows ?? []).map((row) => String(row.user_id)))];
  const iphoneTokenOwnerUserIds = [
    ...new Set(
      (tokenRows ?? [])
        .filter((row) => String(row.platform ?? "").toLowerCase() === "ios")
        .map((row) => String(row.user_id))
    ),
  ];

  const tokenQueryMatchesAnyTokenOwner = tokenOwnerUserIds.includes(tokenQueryUserId);
  const tokenQueryMatchesIphoneTokenOwner = iphoneTokenOwnerUserIds.includes(tokenQueryUserId);
  const tokenQueryIsSender =
    tokenQueryUserId === senderUserId || (dmSenderId != null && tokenQueryUserId === dmSenderId);

  const resolution: DmRecipientResolution = {
    messageId,
    senderUserId: dmSenderId ?? senderUserId,
    recipientUserId: dmRecipientId,
    conversationParticipants,
    notificationUserId,
    notificationActorId,
    tokenQueryUserId,
    dmRowFound: Boolean(dmRow),
    notificationUserMatchesDmRecipient,
    tokenQueryIsSender,
    tokenOwnerUserIds,
    tokenQueryMatchesAnyTokenOwner,
    iphoneTokenOwnerUserIds,
    tokenQueryMatchesIphoneTokenOwner,
  };

  pushServerLog("3", "DM recipient resolution", {
    messageId: resolution.messageId,
    sender_user_id: resolution.senderUserId,
    recipient_user_id: resolution.recipientUserId,
    conversation_participants: resolution.conversationParticipants,
    notification_user_id: resolution.notificationUserId,
    notification_actor_id: resolution.notificationActorId,
    jwt_sender_user_id: senderUserId,
    token_query_user_id: resolution.tokenQueryUserId,
    dm_row_found: resolution.dmRowFound,
    notification_user_matches_dm_recipient: resolution.notificationUserMatchesDmRecipient,
    token_query_is_sender: resolution.tokenQueryIsSender,
    token_owner_user_ids: resolution.tokenOwnerUserIds,
    iphone_token_owner_user_ids: resolution.iphoneTokenOwnerUserIds,
    token_query_matches_any_token_owner: resolution.tokenQueryMatchesAnyTokenOwner,
    token_query_matches_iphone_token_owner: resolution.tokenQueryMatchesIphoneTokenOwner,
  });

  if (tokenQueryIsSender) {
    pushServerError("3", "Token query user_id is the SENDER — wrong target for DM push", {
      tokenQueryUserId,
      senderUserId: resolution.senderUserId,
      recipientUserId: resolution.recipientUserId,
    });
  }

  if (!tokenQueryMatchesIphoneTokenOwner && iphoneTokenOwnerUserIds.length > 0) {
    pushServerError("3", "Token query user_id does NOT match iPhone token owner(s)", {
      tokenQueryUserId,
      iphoneTokenOwnerUserIds,
      recipientUserId: resolution.recipientUserId,
      senderUserId: resolution.senderUserId,
    });
  }

  return resolution;
}
