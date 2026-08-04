"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Megaphone, RefreshCw } from "lucide-react";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import NavigationStackScreen from "@/components/NavigationStackScreen";
import OfficialChannelComposer from "@/components/officialChannel/OfficialChannelComposer";
import OfficialChannelPostCard from "@/components/officialChannel/OfficialChannelPostCard";
import Shell from "@/components/Shell";
import {
  fetchOfficialChannelPosts,
  markOfficialChannelReadUpTo,
  type OfficialChannelPostRow,
} from "@/lib/officialChannel";
import { MOBILE_BOTTOM_NAV_PADDING, MOBILE_MAIN_SCROLL_CLASS } from "@/lib/mobileLayout";
import { supabase } from "@/lib/supabaseClient";

function OfficialChannelContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("postId")?.trim() || null;
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;

  const [posts, setPosts] = useState<OfficialChannelPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfficial, setIsOfficial] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const documentVisibleRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );

  const newestPublishedAt = useMemo(
    () => posts.find((post) => post.published_at)?.published_at ?? null,
    [posts]
  );

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchOfficialChannelPosts();
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPosts(result.posts);
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts, reloadKey]);

  useEffect(() => {
    if (!userId) {
      setIsOfficial(false);
      return;
    }

    let active = true;

    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_official")
        .eq("id", userId)
        .maybeSingle();

      if (active) {
        setIsOfficial(data?.is_official === true);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  const markReadIfVisible = useCallback(
    async (publishedAt: string | null) => {
      if (!userId || !publishedAt) {
        return;
      }

      if (!documentVisibleRef.current) {
        return;
      }

      await markOfficialChannelReadUpTo(userId, publishedAt);
    },
    [userId]
  );

  useEffect(() => {
    if (loading || error || !newestPublishedAt) {
      return;
    }

    void markReadIfVisible(newestPublishedAt);
  }, [loading, error, newestPublishedAt, markReadIfVisible, reloadKey]);

  useEffect(() => {
    const onVisibility = () => {
      documentVisibleRef.current = document.visibilityState === "visible";

      if (documentVisibleRef.current && newestPublishedAt) {
        void markReadIfVisible(newestPublishedAt);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markReadIfVisible, newestPublishedAt]);

  useEffect(() => {
    const channel = supabase
      .channel(`official-channel-posts:${userId ?? "anon"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "official_channel_posts",
        },
        (payload) => {
          const row = payload.new as OfficialChannelPostRow;

          if (!row?.id || row.status !== "published") {
            return;
          }

          setPosts((current) => {
            if (current.some((post) => post.id === row.id)) {
              return current;
            }

            return [row, ...current];
          });

          if (documentVisibleRef.current && row.published_at) {
            void markReadIfVisible(row.published_at);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, markReadIfVisible]);

  useEffect(() => {
    if (!highlightPostId || loading || posts.length === 0) {
      return;
    }

    const exists = posts.some((post) => post.id === highlightPostId);

    if (!exists) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`official-channel-post-${highlightPostId}`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      setHighlightedId(highlightPostId);
    });

    const clearHighlight = window.setTimeout(() => {
      setHighlightedId((current) => (current === highlightPostId ? null : current));
    }, 2600);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clearHighlight);
    };
  }, [highlightPostId, loading, posts]);

  return (
    <Shell showHeader={false} flushTop fixedLayout>
      <NavigationStackScreen fallbackHref="/profile">
        <MobileSecondaryHeader title={t("profile.officialChannelCardTitle")} backHref="/profile" />

        <div
          data-mobile-main-scroll=""
          className={`${MOBILE_MAIN_SCROLL_CLASS} ${MOBILE_BOTTOM_NAV_PADDING}`}
        >
          <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-6">
            <div className="mb-6 flex flex-col items-center text-center">
              <p className="text-2xl font-bold tracking-tight text-white">
                Spot<span className="text-primary">Drop</span>
              </p>

              <div className="mt-4 flex items-center gap-1.5">
                <p className="text-lg font-semibold text-white">
                  {t("profile.officialChannelCardTitle")}
                </p>
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 shrink-0"
                  role="img"
                  aria-label={t("officialChannel.verifiedLabel")}
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
              </div>

              <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
                {t("officialChannel.postingRestriction")}
              </p>
            </div>

            {isOfficial ? (
              <OfficialChannelComposer
                onPublished={(post) => {
                  setPosts((current) => {
                    if (current.some((item) => item.id === post.id)) {
                      return current;
                    }

                    return [post, ...current];
                  });

                  if (post.published_at) {
                    void markReadIfVisible(post.published_at);
                  }
                }}
              />
            ) : null}

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                <p className="text-sm">{t("officialChannel.loading")}</p>
              </div>
            ) : error ? (
              <div className="rounded-[28px] border border-red-500/20 bg-red-500/5 p-5 text-center">
                <p className="text-sm text-red-200">{error}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((value) => value + 1)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-background"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  {t("officialChannel.retry")}
                </button>
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Megaphone className="h-7 w-7 text-primary" strokeWidth={1.75} aria-hidden />
                </div>
                <p className="max-w-xs text-sm leading-relaxed text-muted">
                  {t("officialChannel.empty")}
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {posts.map((post) => (
                  <li key={post.id}>
                    <OfficialChannelPostCard
                      post={post}
                      highlighted={highlightedId === post.id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </NavigationStackScreen>
    </Shell>
  );
}

export default function OfficialChannelView() {
  return <OfficialChannelContent />;
}
