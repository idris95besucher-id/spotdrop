import { parseCityRoomMessageContent } from "@/lib/cityRoomPlaceMessage";
import type { TranslationKey } from "@/lib/i18n/messages";

type TranslateFn = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function formatRoomMessagePreview(content: string | null | undefined, t: TranslateFn, max = 100) {
  const trimmed = (content ?? "").trim();

  if (!trimmed) {
    return t("chats.preview.roomMessage");
  }

  const parsed = parseCityRoomMessageContent(trimmed);

  if (parsed.kind === "place") {
    return t("chats.preview.roomPlace", { name: parsed.place.name });
  }

  if (parsed.kind === "image") {
    return t("chats.preview.roomPhoto");
  }

  if (parsed.kind === "location_card") {
    return t("chats.preview.locationCard");
  }

  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}

export function formatRoomUnreadLabel(count: number, t: TranslateFn) {
  if (count <= 0) {
    return null;
  }

  if (count === 1) {
    return t("chats.roomOneNewMessage");
  }

  return t("chats.roomNewMessages", { count });
}
