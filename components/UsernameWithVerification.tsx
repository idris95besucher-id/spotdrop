import { BadgeCheck } from "lucide-react";

type UsernameWithVerificationProps = {
  username: string;
  isVerified?: boolean | null;
  /** Applied to the outer wrapper — control text size/weight/color here. */
  className?: string;
  /** Checkmark size in px. Default fits normal cards (14-16px contexts). */
  iconSize?: number;
};

/**
 * Username + inline blue verified checkmark, used everywhere a username is shown.
 * Truncates the username, never wraps or shrinks the badge.
 */
export default function UsernameWithVerification({
  username,
  isVerified,
  className = "",
  iconSize = 15,
}: UsernameWithVerificationProps) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${className}`}>
      <span className="truncate">{username}</span>
      {isVerified ? (
        <BadgeCheck
          width={iconSize}
          height={iconSize}
          strokeWidth={2}
          className="shrink-0 text-cyan-400"
          aria-label="Verified account"
          role="img"
        />
      ) : null}
    </span>
  );
}
