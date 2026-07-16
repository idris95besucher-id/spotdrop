/**
 * Group chats are a newer surface than DMs — unlike `lib/i18n/localizeUserMessage`
 * (which intentionally hides raw Postgres/RLS/schema text from end users across the
 * rest of the app), we deliberately show the *real* Supabase/Postgres error message
 * here. Swallowing it into a generic "Something went wrong" made every group-chat
 * RPC failure (missing migration, RLS denial, FK violation, etc.) undebuggable from
 * the UI. Every group RPC wrapper in lib/groupChats.ts / lib/groupChatMessages.ts
 * also console.errors the full { message, code, details, hint } shape, so Safari Web
 * Inspector / Xcode console show the same real error the UI displays.
 */
export function describeGroupError(error: string | null | undefined, fallback: string): string {
  const trimmed = error?.trim();
  return trimmed ? trimmed : fallback;
}
