"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import ProfileGalleryFeedCard from "@/components/profile/ProfileGalleryFeedCard";
import SpotCommentsSheet from "@/components/SpotCommentsSheet";
import { useI18n } from "@/components/I18nProvider";
import type { ProfileContentPost } from "@/lib/profileContent";
import { useHorizontalSwipeClose } from "@/lib/useHorizontalSwipeClose";

type ProfileGalleryFeedViewerProps = {
  items: ProfileContentPost[];
  initialPostId: string;
  userId: string;
  ownerUsername?: string | null;
  isOwner?: boolean;
  title?: string | null;
  onClose: () => void;
  onOpenItemMenu?: (item: ProfileContentPost) => void;
};

/**
 * Instagram-style vertical gallery feed. Every photo is its own independent card
 * (ProfileGalleryFeedCard) that owns and fetches its own like/comment state keyed by its own
 * post_id — there is no shared activeIndex and no shared engagement footer, so scrolling never
 * mixes one card's counts with another's.
 *
 * Closes via the back button or a horizontal swipe-right, never a vertical swipe-down: this feed
 * *is* a vertical scroller, so a swipe-down-to-dismiss gesture would fight the feed's own
 * scrolling on the same axis (the same class of bug already fixed once on the My Chats list,
 * where a full-screen gesture captured vertical scroll). ProfilePostFeedViewer (the "Spots" feed
 * in My Profile) already solved this the same way — horizontal close, vertical scroll — and this
 * viewer reuses the exact same `useHorizontalSwipeClose` hook so both feeds close identically:
 * same threshold, same drag-follows-finger tracking, same transition duration/easing.
 */
export default function ProfileGalleryFeedViewer({
  items,
  initialPostId,
  userId,
  ownerUsername = null,
  isOwner = false,
  title = null,
  onClose,
  onOpenItemMenu,
}: ProfileGalleryFeedViewerProps) {
  const { t } = useI18n();
  const screenRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScrollToInitialRef = useRef(false);
  const [gestureHost, setGestureHost] = useState<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [commentCountUpdate, setCommentCountUpdate] = useState<{ postId: string; count: number } | null>(
    null
  );

  const setScreenNode = useCallback((node: HTMLDivElement | null) => {
    screenRef.current = node;
    setGestureHost(node);
  }, []);

  // Note: the gesture host must NOT carry role="dialog" (or any other selector matched by
  // useHorizontalSwipeClose's blocked-target check — button, a, input, textarea, select,
  // [contenteditable], [role="dialog"]). That check exists so a *nested* dialog/sheet on top of
  // the feed can own its own gesture; if the feed's own root also matched it, every touch inside
  // the whole feed would match its own ancestor and the gesture would never even start. This was
  // the exact root cause of an earlier "swipe-right does nothing" bug here — ProfilePostFeedViewer
  // never had this problem because its screen node was never given role="dialog".
  const { panelStyle, screenStyle, requestClose, isClosing } = useHorizontalSwipeClose({
    onClose,
    targetRef: screenRef,
    panelRef,
    enabled: mounted && Boolean(gestureHost),
    gestureHost,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Scrolls the tapped post to the top of the feed on open; every other post stays in its
  // natural place above/below it, exactly like opening a specific post in an Instagram feed.
  useLayoutEffect(() => {
    if (!mounted || didScrollToInitialRef.current || items.length === 0) {
      return;
    }

    const scrollRoot = scrollRef.current;

    if (!scrollRoot) {
      return;
    }

    const targetEl = scrollRoot.querySelector<HTMLElement>(
      `[data-profile-feed-post-id="${initialPostId.replace(/"/g, "")}"]`
    );

    if (targetEl) {
      targetEl.scrollIntoView({ block: "start", behavior: "auto" });
      didScrollToInitialRef.current = true;
    }
  }, [initialPostId, items, mounted]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isClosing) {
        requestClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isClosing, requestClose]);

  const handleCommentsClick = useCallback((postId: string) => {
    setCommentsPostId(postId);
  }, []);

  if (!mounted || items.length === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={setScreenNode}
      className="fixed inset-0 z-[200] overscroll-none text-white"
      style={screenStyle}
    >
      <div ref={panelRef} className="flex h-full flex-col bg-black" style={panelStyle}>
        <header
          className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 pb-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
        >
          <button
            type="button"
            onClick={requestClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white ring-1 ring-white/10 transition hover:bg-white/10"
            aria-label={t("post.goBack")}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          {title ? <h1 className="truncate text-base font-semibold text-white">{title}</h1> : null}
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {items.map((item) => (
            <ProfileGalleryFeedCard
              key={item.id}
              item={item}
              userId={userId}
              ownerUsername={ownerUsername}
              isOwner={isOwner}
              onOpenItemMenu={onOpenItemMenu}
              onCommentsClick={handleCommentsClick}
              commentCountUpdate={commentCountUpdate}
            />
          ))}
        </div>
      </div>

      <SpotCommentsSheet
        postId={commentsPostId}
        userId={userId}
        isOpen={Boolean(commentsPostId)}
        onClose={() => setCommentsPostId(null)}
        elevated
        onCountChange={(count) => {
          if (!commentsPostId) {
            return;
          }

          setCommentCountUpdate({ postId: commentsPostId, count });
        }}
      />
    </div>,
    document.body
  );
}
