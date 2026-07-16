import type { TranslationKey } from "@/lib/i18n/messages";
import { publicProfileUsername } from "@/lib/publicProfile";

export const GROUP_SYSTEM_EVENT_MARKER = "SPOTDROP_GROUP_EVENT_V1::";

export type GroupSystemEventKind =
  | "created"
  | "added"
  | "removed"
  | "left"
  | "promoted"
  | "demoted"
  | "transferred"
  | "renamed"
  | "photo_changed";

export type GroupSystemEvent = {
  event: GroupSystemEventKind;
  actorId: string;
  targetIds: string[];
  name?: string;
};

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function isGroupSystemEventMessage(body: string | null | undefined): boolean {
  return typeof body === "string" && body.startsWith(GROUP_SYSTEM_EVENT_MARKER);
}

export function parseGroupSystemEvent(body: string | null | undefined): GroupSystemEvent | null {
  if (!isGroupSystemEventMessage(body)) {
    return null;
  }

  try {
    const raw = JSON.parse(body!.slice(GROUP_SYSTEM_EVENT_MARKER.length)) as Record<string, unknown>;

    if (!raw || typeof raw.event !== "string" || typeof raw.actorId !== "string") {
      return null;
    }

    return {
      event: raw.event as GroupSystemEventKind,
      actorId: raw.actorId,
      targetIds: Array.isArray(raw.targetIds)
        ? raw.targetIds.filter((id): id is string => typeof id === "string")
        : [],
      name: typeof raw.name === "string" ? raw.name : undefined,
    };
  } catch {
    return null;
  }
}

function nameFor(
  userId: string,
  usernameById: Map<string, string>,
  currentUserId: string | null | undefined,
  t: TranslateFn
) {
  if (currentUserId && userId === currentUserId) {
    return t("common.you");
  }

  return publicProfileUsername(usernameById.get(userId));
}

/** Human-readable text for a system message row, shown centered like WhatsApp/Instagram. */
export function formatGroupSystemEventText(
  event: GroupSystemEvent,
  usernameById: Map<string, string>,
  t: TranslateFn,
  currentUserId?: string | null
): string {
  const actor = nameFor(event.actorId, usernameById, currentUserId, t);
  const targets = event.targetIds.map((id) => nameFor(id, usernameById, currentUserId, t));
  const targetList = targets.join(", ");

  switch (event.event) {
    case "created":
      return t("group.system.created", { actor });
    case "added":
      return t("group.system.added", { actor, targets: targetList });
    case "removed":
      return t("group.system.removed", { actor, targets: targetList });
    case "left":
      return t("group.system.left", { actor });
    case "promoted":
      return t("group.system.promoted", { actor, targets: targetList });
    case "demoted":
      return t("group.system.demoted", { actor, targets: targetList });
    case "transferred":
      return t("group.system.transferred", { actor, targets: targetList });
    case "renamed":
      return t("group.system.renamed", { actor, name: event.name ?? "" });
    case "photo_changed":
      return t("group.system.photoChanged", { actor });
    default:
      return "";
  }
}
