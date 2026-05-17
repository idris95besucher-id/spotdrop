"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { getPostMediaType, NOT_SIGNED_IN_UPLOAD_MESSAGE, uploadPostMedia } from "@/lib/postMedia";
import { supabase } from "@/lib/supabaseClient";

export type CreatedProfilePost = {
  id: string;
  user_id: string;
  content: string;
  visibility: "public" | "private";
  image_url?: string | null;
  video_url?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  updated_at: string;
};

type CreatePostFormProps = {
  userId: string;
  onCreated: (post: CreatedProfilePost) => void;
};

type PostInsertRow = {
  user_id: string;
  content: string;
  visibility: "public" | "private";
  media_url: string | null;
  media_type: string | null;
  image_url: string | null;
  video_url: string | null;
};

function buildPostInsertRow(
  authUserId: string,
  content: string,
  visibility: "public" | "private",
  mediaUrl: string | null,
  mediaType: string | null
): PostInsertRow {
  const row: PostInsertRow = {
    user_id: authUserId,
    content,
    visibility,
    media_url: mediaUrl,
    media_type: mediaType,
    image_url: null,
    video_url: null,
  };

  if (mediaUrl && mediaType === "image") {
    row.image_url = mediaUrl;
  } else if (mediaUrl && mediaType === "video") {
    row.video_url = mediaUrl;
  }

  return row;
}

export default function CreatePostForm({ userId, onCreated }: CreatePostFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setContent("");
    setVisibility("public");
    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
    setError(null);

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
      event.target.value = "";
      return;
    }

    setError(null);
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setMediaType(nextMediaType);
  };

  const clearMedia = () => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    setMediaFile(null);
    setMediaPreviewUrl(null);
    setMediaType(null);
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedContent = content.trim();
    const hasMedia = Boolean(mediaFile);

    if (!trimmedContent && !hasMedia) {
      setError("Add text, a photo, or a video before publishing.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
        return;
      }

      if (user.id !== userId) {
        setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
        return;
      }

      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to verify profile before post:", {
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          code: profileError.code,
        });
        throw new Error(profileError.message || "Unable to verify your profile.");
      }

      if (!profileRow) {
        setError("Complete your profile before posting.");
        return;
      }

      let mediaUrl: string | null = null;
      let savedMediaType: string | null = null;

      if (mediaFile) {
        const uploadResult = await uploadPostMedia(user.id, mediaFile);
        mediaUrl = uploadResult.mediaUrl;
        savedMediaType = uploadResult.mediaType;
      }

      const postRow = buildPostInsertRow(user.id, trimmedContent, visibility, mediaUrl, savedMediaType);

      const { data: insertedPost, error: insertError } = await supabase
        .from("posts")
        .insert(postRow)
        .select("id, user_id, content, visibility, image_url, video_url, media_url, media_type, created_at, updated_at")
        .single();

      if (insertError) {
        console.error("Failed to create post:", {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
        });
        throw new Error(insertError.message || "Unable to publish your post.");
      }

      if (!insertedPost) {
        throw new Error("Unable to publish your post.");
      }

      console.log("inserted post into public.posts:", insertedPost);

      onCreated(insertedPost);
      resetForm();
      setIsOpen(false);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish your post.");
    } finally {
      setPublishing(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex flex-1 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        Create Post
      </button>
    );
  }

  return (
    <form onSubmit={handlePublish} className="w-full basis-full space-y-4 rounded-3xl border border-white/10 bg-slate-950 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">New post</h2>
        <button
          type="button"
          onClick={() => {
            if (!publishing) {
              resetForm();
              setIsOpen(false);
            }
          }}
          disabled={publishing}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label="Close create post"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Share what you're up to…"
        rows={4}
        disabled={publishing}
        className="w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-7 text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
      />

      <div className="grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-slate-900/80 p-1">
        {(["public", "private"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setVisibility(option)}
            disabled={publishing}
            className={`rounded-3xl px-4 py-2.5 text-sm font-semibold capitalize transition ${
              visibility === option ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:bg-white/10"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {mediaPreviewUrl && mediaType ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
          {mediaType === "video" ? (
            <video src={mediaPreviewUrl} controls className="max-h-72 w-full bg-black object-contain" />
          ) : (
            <img src={mediaPreviewUrl} alt="Selected post media preview" className="max-h-72 w-full object-cover" />
          )}
          <div className="flex justify-end border-t border-white/10 p-3">
            <button
              type="button"
              onClick={clearMedia}
              disabled={publishing}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Remove media
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={publishing}
            onChange={handleMediaChange}
          />
          <ImagePlus className="h-4 w-4 text-cyan-300" />
          Photo
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={publishing}
            onChange={handleMediaChange}
          />
          <Video className="h-4 w-4 text-cyan-300" />
          Video
        </label>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={publishing}
          className="inline-flex items-center justify-center gap-2 rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Publishing…
            </>
          ) : (
            "Publish"
          )}
        </button>
        <button
          type="button"
          disabled={publishing}
          onClick={() => {
            resetForm();
            setIsOpen(false);
          }}
          className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
