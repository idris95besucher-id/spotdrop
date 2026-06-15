import type { LucideProps } from "lucide-react";

/**
 * SpotDrop brand mark: map pin with a centered target dot.
 * Use for Spots tab, feed branding, and spot empty states — not generic location labels.
 */
export default function SpotDropSpotsIcon({
  className,
  strokeWidth = 1.75,
  ...props
}: LucideProps) {
  const stroke = typeof strokeWidth === "number" ? strokeWidth : Number(strokeWidth) || 1.75;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M12 21.5s-5.4-4.85-5.4-9.85a5.4 5.4 0 1 1 10.8 0c0 5-5.4 9.85-5.4 9.85z" />
      <circle cx="12" cy="11.35" r="2.1" strokeWidth={stroke * 0.9} />
      <circle cx="12" cy="11.35" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}
