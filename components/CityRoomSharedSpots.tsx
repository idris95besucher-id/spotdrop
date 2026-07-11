"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import { useI18n } from "@/components/I18nProvider";
import { localizeCityName } from "@/lib/i18n/localizeGeo";
import SpotPostMeta from "@/components/SpotPostMeta";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import SpotStatsBar from "@/components/SpotStatsBar";
import { getSafeAuthSession } from "@/lib/authSession";
import type { FeedSpotRow } from "@/lib/feed";
import { getFeedSpotPublicStats } from "@/lib/feed";
import {
  getSharedSpotPlaceLabel,
  loadCityRoomSharedSpots,
  type CityRoomContext,
} from "@/lib/cityRoomSharedSpots";
import { feedRowsToViewerItems } from "@/lib/postViewer";
import { getPostMedia } from "@/lib/posts";
import { publicProfileUsername } from "@/lib/publicProfile";
import { SPOT_STATS_UPDATED_EVENT, dispatchSpotStatsUpdated, type SpotStatsUpdatedDetail } from "@/lib/spotStatsEvents";

type CityRoomSharedSpotsProps = {
  room: CityRoomContext | null;
};

export default function CityRoomSharedSpots({ room }: CityRoomSharedSpotsProps) {
  const { t, locale } = useI18n();
  const [spots, setSpots] = useState<FeedSpotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      setViewerId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const handleStatsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<SpotStatsUpdatedDetail>).detail;

      if (!detail?.postId) {
        return;
      }

      setSpots((current) =>
        current.map((spot) => {
          if (spot.id !== detail.postId) {
            return spot;
          }

          return {
            ...spot,
            visited_count: detail.visited_count ?? spot.visited_count,
            comments_count: detail.comments_count ?? spot.comments_count,
            collection_save_count: detail.saved_count ?? spot.collection_save_count,
          };
        })
      );
    };

    window.addEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);

    return () => {
      window.removeEventListener(SPOT_STATS_UPDATED_EVENT, handleStatsUpdated);
    };
  }, []);

  const viewerItems = useMemo(() => feedRowsToViewerItems(spots), [spots]);

  useEffect(() => {
    if (!room?.cityId || !room.cityName) {
      setSpots([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const result = await loadCityRoomSharedSpots(room);

      if (cancelled) {
        return;
      }

      setSpots(result.spots);
      setError(result.error);
      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [room?.cityId, room?.cityName, room?.citySlug]);

  if (!room) {
    return null;
  }

  return (
    <div className="relative z-10 px-4 pt-4">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-black/25 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">{t("rooms.sharedSpots")}</p>
          <p className="text-xs text-slate-400">
            {localizeCityName(locale, {
              slug: room.citySlug,
              name: room.cityName,
              countrySlug: room.countrySlug,
            })}
          </p>
        </div>

        {loading ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`room-shared-spots-loading-${index}`}
                className="aspect-[4/5] animate-pulse rounded-2xl bg-white/5"
              />
            ))}
          </div>
        ) : error ? (
          <p className="mt-4 text-sm text-red-200">{error}</p>
        ) : spots.length === 0 ? (
          <div className="mt-4 text-center">
            <SpotDropSpotsIcon className="mx-auto h-6 w-6 text-accent/80" strokeWidth={1.5} aria-hidden />
            <p className="mt-2 text-sm text-slate-300">No spots shared here yet.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {spots.map((spot, index) => {
              const { mediaUrl } = getPostMedia(spot);
              const username = publicProfileUsername(spot.profiles?.username);
              const placeLabel = getSharedSpotPlaceLabel(spot, locale);
              const clickedSpot = viewerItems[index];
              const locationFields = {
                id: spot.id,
                user_id: spot.user_id,
                content_kind: spot.content_kind,
                spot_name: spot.spot_name,
                spot_address: spot.spot_address,
                spot_city: spot.spot_city,
                spot_country: spot.spot_country,
                spot_latitude: spot.spot_latitude,
                spot_longitude: spot.spot_longitude,
              };

              return (
                <article
                  key={spot.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-black/25 shadow-lg shadow-black/20"
                >
                  <div className="flex items-center gap-2 px-4 pt-3">
                    <Link
                      href={`/user?id=${spot.user_id}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {spot.profiles?.avatar_url ? (
                        <img
                          src={spot.profiles.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserRound className="h-4 w-4 text-slate-400" aria-hidden />
                      )}
                    </Link>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{username}</p>
                      <p className="text-xs text-slate-400">
                        {username} shared a Spot in {placeLabel}
                      </p>
                    </div>
                  </div>

                  {mediaUrl ? (
                    <PostMediaLink
                      postId={spot.id}
                      className="mt-2 block bg-black"
                      viewerItems={viewerItems}
                      clickedSpot={clickedSpot}
                    >
                      <PostCardMedia
                        post={spot}
                        className="aspect-[4/5] w-full"
                        imageClassName="aspect-[4/5] w-full object-cover"
                      />
                    </PostMediaLink>
                  ) : (
                    <div className="mt-2 flex aspect-[4/5] items-center justify-center bg-white/5 px-4 text-center text-xs text-slate-300">
                      Media unavailable
                    </div>
                  )}

                  <div className="space-y-2 px-4 py-3">
                    <SpotStatsBar
                      stats={getFeedSpotPublicStats(spot)}
                      onCommentsClick={() => setCommentsPostId(spot.id)}
                    />
                    <SpotPostMeta content={spot.content} location={locationFields} createdAt={spot.created_at} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <SpotCommentsSheet
        postId={commentsPostId}
        userId={viewerId}
        isOpen={Boolean(commentsPostId)}
        onClose={() => setCommentsPostId(null)}
        onCountChange={(count) => {
          if (commentsPostId) {
            dispatchSpotStatsUpdated({ postId: commentsPostId, comments_count: count });
          }
        }}
      />
    </div>
  );
}
