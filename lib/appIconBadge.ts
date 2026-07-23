import { isCapacitorNative } from "@/lib/capacitorUtils";

/**
 * Sync the native app-icon badge with the My Chats unread total.
 * No-op on web. Setting 0 clears/removes the badge on iOS.
 */
export async function syncAppIconBadge(count: number) {
  if (!isCapacitorNative()) {
    return;
  }

  const next = Math.max(0, Math.floor(count));

  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    await Badge.set({ count: next });
    console.log("[App badge] synced", next);
  } catch (error) {
    console.warn("[App badge] sync failed", error);
  }
}
