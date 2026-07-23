"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Globe2, Lock } from "lucide-react";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import PostCardMedia from "@/components/PostCardMedia";
import PostMediaLink from "@/components/PostMediaLink";
import ProfileAvatar from "@/components/ProfileAvatar";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { loadChannelDetail, type ChannelVisibility, type SpotChannel } from "@/lib/channels";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { getProfilePostMedia, type ProfileContentPost } from "@/lib/profileContent";
import { profilePostsToViewerItems } from "@/lib/postViewer";

function visibilityIcon(visibility: ChannelVisibility) {
  return visibility === "public" ? Globe2 : Lock;
}

export default function ChannelView({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [channel, setChannel] = useState<SpotChannel | null>(null);
  const [owner, setOwner] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null);
  const [items, setItems] = useState<ProfileContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSafeAuthSession().then(({ session }) => {
      setViewerId(session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      setError(t("channels.invalid"));
      return;
    }

    setLoading(true);

    void loadChannelDetail(channelId, viewerId).then((result) => {
      setChannel(result.channel);
      setOwner(result.owner);
      setItems(result.items);
      setError(result.error);
      setLoading(false);
    });
  }, [channelId, t, viewerId]);

  const viewerItems = useMemo(() => {
    if (!owner) {
      return [];
    }

    return profilePostsToViewerItems(items, {
      username: owner.username,
      avatar_url: owner.avatar_url,
    });
  }, [items, owner]);

  const VisibilityIcon = channel ? visibilityIcon(channel.visibility) : Lock;

  return (
    <Shell showHeader={false} flushTop>
      <MobileSecondaryHeader
        title={channel?.name ?? t("profile.channels")}
        preferFallback
        backHref={
          owner
            ? viewerId === owner.id
              ? "/profile"
              : `/user?id=${owner.id}`
            : "/profile"
        }
      />

      <div className={`mx-auto w-full max-w-lg px-4 py-4 ${MOBILE_WIDTH_SAFE_CLASS}`}>
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">{t("common.loading")}</p>
        ) : error || !channel ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
            {localizeUserMessage(t, error) ?? error ?? t("channels.invalid")}
          </p>
        ) : (
          <>
            <div className="mb-4 space-y-2">
              {owner ? (
                <Link href={`/user?id=${owner.id}`} className="inline-flex items-center gap-2">
                  <ProfileAvatar
                    src={owner.avatar_url}
                    sizeClassName="h-8 w-8"
                    iconClassName="h-4 w-4"
                    className="bg-slate-800"
                  />
                  <span className="text-sm font-semibold text-white">{owner.username}</span>
                </Link>
              ) : null}

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <VisibilityIcon className="h-3.5 w-3.5" aria-hidden />
                <span>
                  {channel.visibility === "public"
                    ? t("channels.visibility.public")
                    : t("channels.visibility.private")}
                </span>
                <span>·</span>
                <span>
                  {items.length === 1
                    ? t("channels.itemCountOne")
                    : t("channels.itemCountMany", { count: items.length })}
                </span>
              </div>

              {channel.description ? (
                <p className="text-sm leading-relaxed text-slate-300">{channel.description}</p>
              ) : null}
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-muted">
                {t("channels.emptyItems")}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {items.map((post, index) => {
                  const { mediaUrl } = getProfilePostMedia(post);

                  return (
                    <article key={post.id} className="relative aspect-square overflow-hidden bg-slate-950">
                      {mediaUrl ? (
                        <PostMediaLink
                          postId={post.id}
                          className="block h-full w-full"
                          viewerItems={viewerItems}
                          clickedSpot={viewerItems[index]}
                        >
                          <PostCardMedia
                            post={post}
                            postId={post.id}
                            className="aspect-square h-full w-full"
                            imageClassName="aspect-square h-full w-full object-cover"
                          />
                        </PostMediaLink>
                      ) : (
                        <PostMediaLink
                          postId={post.id}
                          className="flex aspect-square h-full w-full items-center justify-center bg-slate-900 px-2 text-center text-xs text-slate-300"
                          viewerItems={viewerItems}
                          clickedSpot={viewerItems[index]}
                        >
                          <span className="line-clamp-4">
                            {post.spot_name?.trim() || post.content?.trim() || t("profile.spotFallback")}
                          </span>
                        </PostMediaLink>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
