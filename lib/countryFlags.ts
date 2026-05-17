export const KOSOVO_FLAG = "🇽🇰";

export const countryFlagBySlug: Record<string, string> = {
  switzerland: "🇨🇭",
  germany: "🇩🇪",
  france: "🇫🇷",
  italy: "🇮🇹",
  spain: "🇪🇸",
  "united-kingdom": "🇬🇧",
  netherlands: "🇳🇱",
  belgium: "🇧🇪",
  austria: "🇦🇹",
  sweden: "🇸🇪",
  norway: "🇳🇴",
  denmark: "🇩🇰",
  finland: "🇫🇮",
  poland: "🇵🇱",
  "czech-republic": "🇨🇿",
  hungary: "🇭🇺",
  greece: "🇬🇷",
  portugal: "🇵🇹",
  ireland: "🇮🇪",
  russia: "🇷🇺",
  ukraine: "🇺🇦",
  belarus: "🇧🇾",
  kazakhstan: "🇰🇿",
  azerbaijan: "🇦🇿",
  armenia: "🇦🇲",
  georgia: "🇬🇪",
  moldova: "🇲🇩",
  latvia: "🇱🇻",
  lithuania: "🇱🇹",
  estonia: "🇪🇪",
  romania: "🇷🇴",
  bulgaria: "🇧🇬",
  serbia: "🇷🇸",
  croatia: "🇭🇷",
  slovenia: "🇸🇮",
  slovakia: "🇸🇰",
  "bosnia-and-herzegovina": "🇧🇦",
  montenegro: "🇲🇪",
  "north-macedonia": "🇲🇰",
  albania: "🇦🇱",
  kosovo: KOSOVO_FLAG,
  cyprus: "🇨🇾",
  malta: "🇲🇹",
  iceland: "🇮🇸",
  luxembourg: "🇱🇺",
  monaco: "🇲🇨",
  andorra: "🇦🇩",
  "san-marino": "🇸🇲",
  "vatican-city": "🇻🇦",
  vatican: "🇻🇦",
  liechtenstein: "🇱🇮",
  kyrgyzstan: "🇰🇬",
  tajikistan: "🇹🇯",
  turkmenistan: "🇹🇲",
  uzbekistan: "🇺🇿",
};

export const countryFlagByCode: Record<string, string> = {
  XK: KOSOVO_FLAG,
};

function isKosovo(slug: string, code?: string | null) {
  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedCode = code?.trim().toUpperCase() || null;

  return normalizedSlug === "kosovo" || normalizedCode === "XK";
}

export function getCountryFlag(slug: string, emoji?: string | null, code?: string | null) {
  if (isKosovo(slug, code)) {
    return KOSOVO_FLAG;
  }

  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedCode = code?.trim().toUpperCase() || null;
  const normalizedEmoji = emoji?.trim() || null;
  const hasRealFlag = normalizedEmoji && normalizedEmoji !== "🌍";

  const mappedFlag =
    countryFlagBySlug[normalizedSlug] ||
    (normalizedCode ? countryFlagByCode[normalizedCode] : undefined);

  return (hasRealFlag ? normalizedEmoji : null) || mappedFlag || "🌍";
}
