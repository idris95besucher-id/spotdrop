"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Globe2, Lock, MapPin, UserPlus, UserRound, Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import Shell from "@/components/Shell";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  loadCollectionDetail,
  type CollectionVisibility,
  type SpotCollection,
} from "@/lib/collections";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import type { TranslationKey } from "@/lib/i18n/messages";
import { getProfilePostMedia } from "@/lib/profileContent";
import { profilePostsToViewerItems } from "@/lib/postViewer";

function visibilityIcon(visibility: CollectionVisibility) {
  switch (visibility) {
    case "public":
      return Globe2;
    case "friends":
      return Users;
    case "invite":
      return UserPlus;
    default:
      return Lock;
  }
}

function visibilityLabelKey(visibility: CollectionVisibility): TranslationKey {
  switch (visibility) {
    case "public":
      return "collections.visibility.public";
    case "friends":
      return "collections.visibility.friends";
    case "invite":
      return "collections.visibility.invite";
    default:
      return "collections.visibility.private";
  }
}

export default function CollectionPage() {
  const { t } = useI18n();
  const params = useParams<{ collectionId: string }>();
  const collectionId = params.collectionId;

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [collection, setCollection] = useState<SpotCollection | null>(null);
  const [owner, setOwner] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);
  const [spots, setSpots] = useState<Awaited<ReturnType<typeof loadCollectionDetail>>["spots"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      setViewerId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!collectionId) {
      setLoading(false);
      setError(t("collectionDetail.invalid"));
      return;
    }

    void loadCollectionDetail(collectionId, viewerId).then((result) => {
      setCollection(result.collection);
      setOwner(result.owner);
      setSpots(result.spots);
      setError(result.error);
      setLoading(false);
    });
  }, [collectionId, t, viewerId]);

  const coverUrl = useMemo(() => {
    if (!collection) {
      return null;
    }

    const firstSpot = spots[0];
    const media = firstSpot ? getProfilePostMedia(firstSpot).mediaUrl : null;

    return collection.cover_image_url ?? media ?? null;
  }, [collection, spots]);

  const viewerItems = useMemo(() => {
    if (!owner) {
      return [];
    }

    return profilePostsToViewerItems(spots, {
      username: owner.username,
      avatar_url: owner.avatar_url,
    });
  }, [owner, spots]);

  const VisibilityIcon = collection ? visibilityIcon(collection.visibility) : Lock;

  return (
    <Shell>
      <div className="mx-auto max-w-lg space-y-5 px-1 pb-10 pt-2">
        <Link href="/profile" className="text-sm font-medium text-muted transition hover:text-primary">
          ← {t("collectionDetail.backToProfile")}
        </Link>

        {loading ? (
          <p className="text-sm text-muted">{t("collectionDetail.loading")}</p>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-6 text-sm text-red-200">
            {localizeUserMessage(t, error) ?? error}
          </div>
        ) : collection ? (
          <>
            <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1026]">
              <div className="relative aspect-[16/9] bg-[#050816]">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    <MapPin className="h-10 w-10 opacity-30" aria-hidden />
                  </div>
                )}
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  <VisibilityIcon className="h-3.5 w-3.5" aria-hidden />
                  {t(visibilityLabelKey(collection.visibility))}
                </span>
              </div>

              <div className="space-y-3 p-4">
                <h1 className="text-2xl font-semibold text-white">{collection.name}</h1>
                {collection.description ? (
                  <p className="text-sm leading-relaxed text-muted">{collection.description}</p>
                ) : null}

                {owner ? (
                  <Link
                    href={`/user/${owner.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:brightness-110"
                  >
                    <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]">
                      {owner.avatar_url ? (
                        <img src={owner.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-4 w-4 text-muted" aria-hidden />
                      )}
                    </span>
                    @{owner.username}
                  </Link>
                ) : null}

                <p className="text-xs text-muted">
                  {spots.length === 1
                    ? t("collectionDetail.spotsInCollectionOne")
                    : t("collectionDetail.spotsInCollectionMany", { count: spots.length })}
                </p>
              </div>
            </section>

            {spots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#050816] px-4 py-10 text-center">
                <p className="text-sm text-muted">{t("collectionDetail.emptySpots")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {spots.map((spot, index) => {
                  const { mediaUrl } = getProfilePostMedia(spot);

                  return (
                    <article key={spot.id} className="relative aspect-square overflow-hidden bg-[#050816]">
                      {mediaUrl ? (
                        <PostMediaLink
                          postId={spot.id}
                          className="block h-full w-full"
                          viewerItems={viewerItems}
                          clickedSpot={viewerItems[index]}
                        >
                          <PostCardMedia post={spot} className="h-full w-full" />
                        </PostMediaLink>
                      ) : (
                        <PostMediaLink
                          postId={spot.id}
                          className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted"
                          viewerItems={viewerItems}
                          clickedSpot={viewerItems[index]}
                        >
                          {spot.spot_name ?? t("profile.spotFallback")}
                        </PostMediaLink>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </Shell>
  );
}
