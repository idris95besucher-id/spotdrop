"use client";

import Link from "next/link";
import { FolderOpen, Globe2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { type CollectionWithMeta } from "@/lib/collections";

type ExploreCollectionCardProps = {
  collection: CollectionWithMeta;
};

export default function ExploreCollectionCard({ collection }: ExploreCollectionCardProps) {
  const { t } = useI18n();
  const cover = collection.cover_image_url;
  const spotCountLabel =
    collection.spot_count === 1
      ? t("collections.spotCountOne")
      : t("collections.spotCountMany", { count: collection.spot_count });

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="block overflow-hidden rounded-2xl border border-white/[0.08] bg-card transition hover:border-primary/25"
    >
      <div className="relative aspect-[16/10] bg-[#050816]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            <FolderOpen className="h-8 w-8 opacity-40" aria-hidden />
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <Globe2 className="h-3 w-3" aria-hidden />
          {t("collections.visibility.public")}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="line-clamp-2 text-sm font-semibold text-white">{collection.name}</p>
        <p className="mt-1 text-xs text-muted">{spotCountLabel}</p>
      </div>
    </Link>
  );
}
