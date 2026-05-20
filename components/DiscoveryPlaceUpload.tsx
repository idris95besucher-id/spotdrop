"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { createPlaceContent } from "@/lib/discoveryPlaces";
import { getPostMediaType, NOT_SIGNED_IN_UPLOAD_MESSAGE, uploadPostMedia } from "@/lib/postMedia";

type DiscoveryPlaceUploadProps = {
  placeId: string;
  userId: string | null;
  defaultKind?: "post" | "story" | "video";
  onCreated: () => void;
};

export default function DiscoveryPlaceUpload({
  placeId,
  userId,
  defaultKind = "post",
  onCreated,
}: DiscoveryPlaceUploadProps) {
  const [contentKind, setContentKind] = useState<"post" | "story" | "video">(defaultKind);
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetMedia = () => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleMediaChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nextMediaType = getPostMediaType(file);

    if (!nextMediaType) {
      setError("Only images and videos are allowed.");
      return;
    }

    if (contentKind === "story" && nextMediaType !== "image") {
      setError("Stories need a photo for now.");
      return;
    }

    if (contentKind === "video" && nextMediaType !== "video") {
      setError("Choose a video file for video uploads.");
      return;
    }

    resetMedia();
    setMediaFile(file);
    setMediaType(nextMediaType);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      return;
    }

    const trimmed = content.trim();

    if (!trimmed && !mediaFile) {
      setError("Add a caption or media.");
      return;
    }

    if (contentKind === "video" && mediaType !== "video") {
      setError("Video uploads require a video file.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      let mediaUrl: string | null = null;
      let savedMediaType: string | null = null;

      if (mediaFile) {
        const uploadResult = await uploadPostMedia(userId, mediaFile);
        mediaUrl = uploadResult.mediaUrl;
        savedMediaType = uploadResult.mediaType;
      }

      const effectiveKind = contentKind === "video" || savedMediaType === "video" ? "video" : contentKind;

      const { error: createError } = await createPlaceContent(
        userId,
        placeId,
        trimmed || `${effectiveKind} at this place`,
        effectiveKind,
        mediaUrl,
        savedMediaType
      );

      if (createError) {
        setError(createError);
        setPublishing(false);
        return;
      }

      setContent("");
      resetMedia();
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to publish.");
    }

    setPublishing(false);
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap gap-2">
        {(["post", "story", "video"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              setContentKind(kind);
              if (kind === "video") {
                resetMedia();
              }
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
              contentKind === kind
                ? "bg-cyan-400 text-slate-950"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {kind}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={2}
        placeholder={
          contentKind === "story"
            ? "Caption for your 24h story…"
            : contentKind === "video"
              ? "Describe your video…"
              : "Share a tip or memory…"
        }
        className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/50"
      />

      {mediaPreviewUrl ? (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/10">
          {mediaType === "video" ? (
            <video src={mediaPreviewUrl} className="max-h-40 w-full object-cover" controls playsInline />
          ) : (
            <img src={mediaPreviewUrl} alt="" className="max-h-40 w-full object-cover" />
          )}
          <button
            type="button"
            onClick={resetMedia}
            className="absolute right-2 top-2 rounded-full bg-slate-950/80 p-1.5 text-slate-200 hover:text-white"
            aria-label="Remove media"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={contentKind === "video" ? "video/*" : "image/*,video/*"}
          className="hidden"
          onChange={handleMediaChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!userId}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          {contentKind === "video" ? <Video className="h-4 w-4" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
          {contentKind === "video" ? "Add video" : "Add media"}
        </button>
        <button
          type="submit"
          disabled={publishing || !userId}
          className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      {!userId ? <p className="mt-2 text-xs text-slate-500">Sign in to upload stories, posts, and videos.</p> : null}
    </form>
  );
}
