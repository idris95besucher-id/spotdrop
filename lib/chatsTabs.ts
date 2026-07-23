export type ChatsInboxTab = "direct" | "groups" | "rooms";

export const CHATS_INBOX_TABS: ChatsInboxTab[] = ["direct", "groups", "rooms"];

export function parseChatsInboxTab(value: string | null | undefined): ChatsInboxTab {
  if (value === "groups" || value === "rooms" || value === "direct") {
    return value;
  }

  return "direct";
}

export function chatsInboxTabHref(tab: ChatsInboxTab) {
  return `/chats?tab=${tab}`;
}

export function inboxItemMatchesTab(
  kind: "dm" | "group" | "room",
  tab: ChatsInboxTab
): boolean {
  if (tab === "direct") {
    return kind === "dm";
  }

  if (tab === "groups") {
    return kind === "group";
  }

  return kind === "room";
}
