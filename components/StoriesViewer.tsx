"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import OwnContentMenu from "@/components/OwnContentMenu";
import ProfileAvatar from "@/components/ProfileAvatar";
import { deleteOwnedStory } from "@/lib/deleteContent";
import type { StoryRow } from "@/lib/stories";
import { publicProfileUsername } from "@/lib/publicProfile";
import { sortStoriesForViewer, STORY_IMAGE_DURATION_MS } from "@/lib/storyViewer";

type StoriesViewerProps = {
  stories: StoryRow[];
  isOpen: boolean;
  onClose: () => void;
  username?: string;
  avatarUrl?: string | null;
  initialIndex?: number;
  viewerUserId?: string | null;
  onStoryDeleted?: (storyId: string) => void;
};

export default function StoriesViewer({
  stories,
  isOpen,
  onClose,
  username,
  avatarUrl,
  initialIndex = 0,
  viewerUserId = null,
  onStoryDeleted,
}: StoriesViewerProps) {
  const sortedStories = useMemo(() => sortStoriesForViewer(stories), [stories]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<number | null>(null);
  const imageStartRef = useRef<number>(0);

  const currentStory = sortedStories[index] ?? null;
  const displayUsername = publicProfileUsername(username);
  const canDeleteCurrentStory = Boolean(
    viewerUserId && currentStory && currentStory.user_id === viewerUserId
  );

  const clearFrame = useCallback(() => {
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const goNext = useCallback(() => {
    setIndex((currentIndex) => {
      if (currentIndex >= sortedStories.length - 1) {
        onClose();
        return currentIndex;
      }

      return currentIndex + 1;
    });
    setProgress(0);
  }, [onClose, sortedStories.length]);

  const goPrev = useCallback(() => {
    setIndex((currentIndex) => {
      if (currentIndex <= 0) {
        return 0;
      }

      return currentIndex - 1;
    });
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const maxIndex = Math.max(0, sortedStories.length - 1);
    setIndex(Math.min(initialIndex, maxIndex));
    setProgress(0);
  }, [initialIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (sortedStories.length === 0) {
      onClose();
      return;
    }

    setIndex((current) => Math.min(current, sortedStories.length - 1));
  }, [isOpen, onClose, sortedStories.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowRight") {
        goNext();
      }

      if (event.key === "ArrowLeft") {
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goNext, goPrev, isOpen, onClose]);

  useEffect(() => {
    clearFrame();

    if (!isOpen || !currentStory || currentStory.media_type === "video") {
      return;
    }

    imageStartRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - imageStartRef.current;
      const nextProgress = Math.min(100, (elapsed / STORY_IMAGE_DURATION_MS) * 100);
      setProgress(nextProgress);

      if (elapsed >= STORY_IMAGE_DURATION_MS) {
        goNext();
        return;
      }

      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return clearFrame;
  }, [clearFrame, currentStory, goNext, index, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentStory || currentStory.media_type !== "video") {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    void video.play().catch(() => undefined);
  }, [currentStory, index, isOpen]);

  if (!isOpen || sortedStories.length === 0 || !currentStory) {
    return null;
  }

  const handleSurfaceClick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const tapX = event.clientX - bounds.left;

    if (tapX < bounds.width * 0.35) {
      goPrev();
      return;
    }

    goNext();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        {sortedStories.map((story, storyIndex) => (
          <div key={story.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-75 ease-linear"
              style={{
                width: storyIndex < index ? "100%" : storyIndex === index ? `${progress}%` : "0%",
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 top-[max(2.25rem,env(safe-area-inset-top))] z-20 flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProfileAvatar
            src={avatarUrl}
            sizeClassName="h-8 w-8"
            iconClassName="h-4 w-4"
            className="bg-slate-800"
          />
          <p className="truncate text-sm font-semibold">{displayUsername}</p>
        </div>
        <div className="flex items-center gap-1">
          {canDeleteCurrentStory ? (
            <OwnContentMenu
              onDelete={() => deleteOwnedStory(currentStory!.id, viewerUserId!)}
              onDeleted={() => {
                const deletedId = currentStory!.id;
                onStoryDeleted?.(deletedId);

                if (sortedStories.length <= 1) {
                  onClose();
                  return;
                }

                if (index >= sortedStories.length - 1) {
                  setIndex((current) => Math.max(0, current - 1));
                }

                setProgress(0);
              }}
            />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
            aria-label="Close stories"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" onClick={handleSurfaceClick} role="presentation">
        {currentStory.media_type === "video" ? (
          <video
            ref={videoRef}
            key={currentStory.id}
            src={currentStory.media_url}
            className="h-full w-full object-contain"
            playsInline
            autoPlay
            muted={false}
            onEnded={goNext}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              const duration = video.duration;

              if (!Number.isFinite(duration) || duration <= 0) {
                return;
              }

              setProgress((video.currentTime / duration) * 100);
            }}
          />
        ) : (
          <img
            key={currentStory.id}
            src={currentStory.media_url}
            alt=""
            className="h-full w-full object-contain"
          />
        )}
      </div>

      {currentStory.caption?.trim() ? (
        <p className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-12 text-sm leading-relaxed text-white">
          {currentStory.caption.trim()}
        </p>
      ) : null}
    </div>
  );
}
