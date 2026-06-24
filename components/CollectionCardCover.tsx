"use client";

import type { LucideIcon } from "lucide-react";

type CollectionCardCoverProps = {
  previews: string[];
  visibilityIcon: LucideIcon;
  visibilityLabel: string;
  /** Optional single cover when no spot previews exist yet. */
  fallbackCoverUrl?: string | null;
};

function MosaicPlaceholder({ index }: { index: number }) {
  const gradients = [
    "from-[#121a2e] via-[#0a1020] to-[#050816]",
    "from-[#0f1628] via-[#080e1a] to-[#050816]",
    "from-[#101828] via-[#0b1220] to-[#060a14]",
    "from-[#0d1526] via-[#090f1c] to-[#050816]",
  ] as const;

  return (
    <div
      className={`h-full w-full bg-gradient-to-br ${gradients[index % gradients.length]}`}
      aria-hidden
    />
  );
}

export default function CollectionCardCover({
  previews,
  visibilityIcon: VisibilityIcon,
  visibilityLabel,
  fallbackCoverUrl = null,
}: CollectionCardCoverProps) {
  const cells: (string | null)[] = Array.from({ length: 4 }, (_, index) => previews[index] ?? null);

  if (previews.length === 0 && fallbackCoverUrl) {
    cells[0] = fallbackCoverUrl;
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[#050816]">
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-black/50">
        {cells.map((url, index) => (
          <div key={`${url ?? "empty"}-${index}`} className="relative min-h-0 min-w-0 overflow-hidden bg-[#080c18]">
            {url ? (
              <img
                src={url}
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <MosaicPlaceholder index={index} />
            )}
          </div>
        ))}
      </div>

      <span
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/90 shadow-sm backdrop-blur-sm"
        title={visibilityLabel}
        aria-label={visibilityLabel}
      >
        <VisibilityIcon className="h-3 w-3" strokeWidth={2} aria-hidden />
      </span>
    </div>
  );
}

export function isMySpotsCollectionName(name: string, localizedMySpotsLabel: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "my spots" ||
    normalized === localizedMySpotsLabel.trim().toLowerCase()
  );
}
