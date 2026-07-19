export const CHAT_PUSH_BANNER_EVENT = "spotdrop:chat-push-banner";

export type ChatPushBannerDetail = {
  message: string;
  href: string;
  sound?: "direct_message" | "group_message" | "room_message" | "like" | "comment";
};

export function dispatchChatPushBanner(detail: ChatPushBannerDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CHAT_PUSH_BANNER_EVENT, { detail }));
}
