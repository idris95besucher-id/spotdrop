/** Local calendar day key (YYYY-MM-DD) for grouping chat messages. */
export function getLocalDateKey(isoTimestamp: string) {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** Whether to show a date divider before the current message. */
export function shouldShowChatDateSeparator(
  previousCreatedAt: string | null | undefined,
  currentCreatedAt: string
) {
  if (!previousCreatedAt) {
    return true;
  }

  const previousKey = getLocalDateKey(previousCreatedAt);
  const currentKey = getLocalDateKey(currentCreatedAt);

  if (!previousKey || !currentKey) {
    return true;
  }

  return previousKey !== currentKey;
}

/** Telegram/WhatsApp-style label: Today, Yesterday, or "15 May 2026". */
export function formatChatDateLabel(isoTimestamp: string) {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const messageKey = getLocalDateKey(isoTimestamp);
  const todayKey = getLocalDateKey(new Date().toISOString());

  if (messageKey === todayKey) {
    return "Today";
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getLocalDateKey(yesterday.toISOString());

  if (messageKey === yesterdayKey) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatChatMessageTime(isoTimestamp: string) {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
