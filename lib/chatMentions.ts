export function messageMentionsUsername(
  content: string | null | undefined,
  username: string | null | undefined
) {
  if (!content?.trim() || !username?.trim()) {
    return false;
  }

  const escaped = username.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}\\b`, "i").test(content);
}
