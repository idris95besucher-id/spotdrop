import type { DirectMessageRow } from "@/lib/directConversations";

const CACHE_TTL_MS = 2 * 60 * 1000;

type CachedThread = {
  messages: DirectMessageRow[];
  cachedAt: number;
};

const cache = new Map<string, CachedThread>();
const inFlight = new Map<string, Promise<DirectMessageRow[]>>();

function threadKey(userId: string, partnerId: string) {
  return `${userId}:${partnerId}`;
}

export function getCachedDmThreadMessages(userId: string, partnerId: string): DirectMessageRow[] | null {
  const entry = cache.get(threadKey(userId, partnerId));

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(threadKey(userId, partnerId));
    return null;
  }

  return entry.messages;
}

export function setCachedDmThreadMessages(userId: string, partnerId: string, messages: DirectMessageRow[]) {
  cache.set(threadKey(userId, partnerId), { messages, cachedAt: Date.now() });
}

export function warmDmThreadCache(userId: string, partnerId: string) {
  if (!userId || !partnerId || userId === partnerId) {
    return;
  }

  const key = threadKey(userId, partnerId);

  if (getCachedDmThreadMessages(userId, partnerId) || inFlight.has(key)) {
    return;
  }

  const promise = import("@/lib/directConversations").then(async ({ loadDirectMessagesForThread }) => {
    const result = await loadDirectMessagesForThread(userId, partnerId);

    if (!result.error) {
      setCachedDmThreadMessages(userId, partnerId, result.messages);
    }

    return result.messages;
  });

  inFlight.set(key, promise);

  void promise.finally(() => {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
    }
  });
}
