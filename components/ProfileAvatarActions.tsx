"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { flushSync } from "react-dom";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import ProfileAvatar from "@/components/ProfileAvatar";
import StoryCameraFlow from "@/components/StoryCameraFlow";
import StoryMediaSourceSheet from "@/components/StoryMediaSourceSheet";
import { pickImageFromGallery, pickMediaFromGallery } from "@/lib/pickMediaFromGallery";
import { getStoryMediaType } from "@/lib/storyMedia";

type ProfileAvatarActionsProps = {
  userId: string;
  avatarUrl?: string | null;
  uploadingAvatar?: boolean;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onStoryCreated: () => void;
  compact?: boolean;
  tiny?: boolean;
};

export default function ProfileAvatarActions({
  userId,
  avatarUrl,
  uploadingAvatar = false,
  onAvatarUpload,
  onStoryCreated,
  compact = false,
  tiny = false,
}: ProfileAvatarActionsProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [storySourceOpen, setStorySourceOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [initialGalleryFile, setInitialGalleryFile] = useState<File | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  const openStorySource = () => {
    setMenuOpen(false);
    setStorySourceOpen(true);
  };

  const openStoryCamera = () => {
    setInitialGalleryFile(null);
    flushSync(() => {
      setStoryOpen(true);
    });
  };

  const handleTakePhoto = () => {
    openStoryCamera();
  };

  const handlePhotoLibrary = () => {
    void pickMediaFromGallery().then((file) => {
      if (!file) {
        return;
      }

      const storyType = getStoryMediaType(file);

      if (!storyType) {
        return;
      }

      setInitialGalleryFile(file);
      flushSync(() => {
        setStoryOpen(true);
      });
    });
  };

  const openPhotoUpload = () => {
    setMenuOpen(false);

    void pickImageFromGallery().then((file) => {
      if (!file) {
        return;
      }

      const input = document.createElement("input");
      input.type = "file";
      const list = new DataTransfer();
      list.items.add(file);
      input.files = list.files;

      const syntheticEvent = {
        target: input,
        currentTarget: input,
      } as ChangeEvent<HTMLInputElement>;

      onAvatarUpload(syntheticEvent);
    });
  };

  const avatarSizeClass = tiny ? "h-12 w-12" : compact ? "h-14 w-14" : "h-24 w-24 sm:h-28 sm:w-28";
  const avatarIconClass = tiny ? "h-5 w-5" : compact ? "h-6 w-6" : "h-11 w-11 sm:h-12 sm:w-12";

  return (
    <>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="group rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          aria-label="Profile photo actions"
          aria-expanded={menuOpen}
        >
          <ProfileAvatar
            src={avatarUrl}
            sizeClassName={avatarSizeClass}
            iconClassName={avatarIconClass}
            className="border border-white/10 shadow-xl shadow-black/50"
          />
        </button>

        {menuOpen ? (
          <div
            className="absolute left-1/2 top-[calc(100%+0.75rem)] z-40 w-52 -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 py-1 shadow-2xl shadow-black/50"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={openPhotoUpload}
              disabled={uploadingAvatar}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="h-4 w-4" aria-hidden />
              )}
              {t("profile.changePhoto")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={openStorySource}
              className="flex w-full items-center gap-2.5 border-t border-white/10 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/5"
            >
              <Sparkles className="h-4 w-4 text-fuchsia-300" aria-hidden />
              {t("profile.addStory")}
            </button>
          </div>
        ) : null}
      </div>

      <StoryMediaSourceSheet
        isOpen={storySourceOpen}
        onClose={() => setStorySourceOpen(false)}
        onTakePhoto={handleTakePhoto}
        onPhotoLibrary={handlePhotoLibrary}
      />

      <StoryCameraFlow
        userId={userId}
        isOpen={storyOpen}
        initialGalleryFile={initialGalleryFile}
        onClose={() => {
          setStoryOpen(false);
          setInitialGalleryFile(null);
        }}
        onCreated={() => {
          setStoryOpen(false);
          setInitialGalleryFile(null);
          onStoryCreated();
        }}
      />
    </>
  );
}
