type UsernameWithVerificationProps = {
  username: string;
  isVerified?: boolean | null;
  /** Applied to the outer wrapper — control text size/weight/color here. */
  className?: string;
  /** Badge size in px. Default fits normal cards (14-16px contexts); pass ~12-13 for compact contexts (comments, chat messages). */
  iconSize?: number;
};

/**
 * Filled blue verified badge with a white checkmark — same rosette shape as the
 * former "official account" badge, now the single verified indicator app-wide.
 */
function VerifiedBadgeIcon({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0"
      role="img"
      aria-label="Verified account"
    >
      <path
        fill="#1687F8"
        d="M23 12l-2.44-2.79.34-3.69-3.61-.82L15.4 1.5 12 2.96 8.6 1.5 6.71 4.69 3.1 5.51l.34 3.69L1 12l2.44 2.8-.34 3.69 3.61.82L8.6 22.5 12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12z"
      />
      <path
        d="m8.6 12.2 2.15 2.15 4.65-4.7"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Username + inline filled verified badge, used everywhere a username is shown.
 * Truncates the username, never wraps or shrinks the badge.
 */
export default function UsernameWithVerification({
  username,
  isVerified,
  className = "",
  iconSize = 16,
}: UsernameWithVerificationProps) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${className}`}>
      <span className="truncate">{username}</span>
      {isVerified ? <VerifiedBadgeIcon size={iconSize} /> : null}
    </span>
  );
}
