import { loadFollowRelationship, type FollowRelationship } from "@/lib/follows";
import type { TranslationKey } from "@/lib/i18n/messages";
import { supabase } from "@/lib/supabaseClient";

export type MessagePrivacy = "everyone" | "followers" | "friends" | "nobody";

export const MESSAGE_PRIVACY_VALUES: MessagePrivacy[] = [
  "everyone",
  "followers",
  "friends",
  "nobody",
];

export type MessagePrivacyBlockReasonKey =
  | "messagePrivacy.blocked.nobody"
  | "messagePrivacy.blocked.followers"
  | "messagePrivacy.blocked.friends";

export function isMessagePrivacy(value: string): value is MessagePrivacy {
  return MESSAGE_PRIVACY_VALUES.includes(value as MessagePrivacy);
}

export function normalizeMessagePrivacy(value: unknown): MessagePrivacy {
  const normalized = typeof value === "string" ? value : "";

  return isMessagePrivacy(normalized) ? normalized : "everyone";
}

export function evaluateMessagePermission(
  privacy: MessagePrivacy,
  relationship: Pick<FollowRelationship, "viewerFollowsTarget" | "targetFollowsViewer">
): { allowed: boolean; reasonKey: MessagePrivacyBlockReasonKey | null } {
  switch (privacy) {
    case "everyone":
      return { allowed: true, reasonKey: null };
    case "nobody":
      return { allowed: false, reasonKey: "messagePrivacy.blocked.nobody" };
    case "followers":
      return relationship.targetFollowsViewer
        ? { allowed: true, reasonKey: null }
        : { allowed: false, reasonKey: "messagePrivacy.blocked.followers" };
    case "friends":
      return relationship.viewerFollowsTarget && relationship.targetFollowsViewer
        ? { allowed: true, reasonKey: null }
        : { allowed: false, reasonKey: "messagePrivacy.blocked.friends" };
    default:
      return { allowed: true, reasonKey: null };
  }
}

export async function loadProfileMessagePrivacy(userId: string): Promise<MessagePrivacy> {
  const { data, error } = await supabase
    .from("profiles")
    .select("message_privacy")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return "everyone";
    }

    console.error("Failed to load message privacy:", error);
    return "everyone";
  }

  return normalizeMessagePrivacy(data?.message_privacy);
}

export async function saveProfileMessagePrivacy(userId: string, privacy: MessagePrivacy) {
  const { error } = await supabase
    .from("profiles")
    .update({ message_privacy: privacy })
    .eq("id", userId);

  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return { error: null as string | null };
    }

    return { error: error.message };
  }

  return { error: null as string | null };
}

export async function checkCanMessageUser(senderId: string, recipientId: string) {
  if (!senderId || !recipientId) {
    return {
      allowed: false,
      reasonKey: "messagePrivacy.blocked.nobody" as MessagePrivacyBlockReasonKey,
      privacy: "nobody" as MessagePrivacy,
    };
  }

  if (senderId === recipientId) {
    return {
      allowed: false,
      reasonKey: "messagePrivacy.blocked.nobody" as MessagePrivacyBlockReasonKey,
      privacy: "nobody" as MessagePrivacy,
    };
  }

  const [privacy, relationshipResult] = await Promise.all([
    loadProfileMessagePrivacy(recipientId),
    loadFollowRelationship(senderId, recipientId),
  ]);

  if (relationshipResult.error || !relationshipResult.data) {
    console.error("Failed to load follow relationship for message privacy:", relationshipResult.error);
    return {
      allowed: false,
      reasonKey: "messagePrivacy.blocked.nobody" as MessagePrivacyBlockReasonKey,
      privacy,
    };
  }

  const evaluation = evaluateMessagePermission(privacy, relationshipResult.data);

  return {
    allowed: evaluation.allowed,
    reasonKey: evaluation.reasonKey,
    privacy,
  };
}

export function messagePrivacyBlockMessage(
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
  reasonKey: MessagePrivacyBlockReasonKey | null
) {
  if (!reasonKey) {
    return null;
  }

  return t(reasonKey);
}

export async function filterRecipientsAllowedToMessage<T extends { id: string }>(
  senderId: string,
  recipients: T[]
) {
  if (recipients.length === 0) {
    return recipients;
  }

  const results = await Promise.all(
    recipients.map(async (recipient) => ({
      recipient,
      allowed: (await checkCanMessageUser(senderId, recipient.id)).allowed,
    }))
  );

  return results.filter((entry) => entry.allowed).map((entry) => entry.recipient);
}
