"use client";

import type { PostMediaFields } from "@/lib/posts";
import { getPostMedia, getPostThumbnailUrl } from "@/lib/posts";

type PostCardMediaProps = {
  post: PostMediaFields;
  className?: string;
  imageClassName?: string;
};

export default function PostCardMedia({
  post,
  className = "",
  imageClassName = "h-full w-full object-cover",
}: PostCardMediaProps) {
  const { mediaUrl, mediaType } = getPostMedia(post);
  const thumbnailUrl = getPostThumbnailUrl(post);

  if (!mediaUrl && !thumbnailUrl) {
    return null;
  }

  if (mediaType === "video") {
    if (thumbnailUrl) {
      return (
        <div className={`relative ${className}`}>
          <img src={thumbnailUrl} alt="" className={imageClassName} />
          <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Video
          </span>
        </div>
      );
    }

    return <video src={mediaUrl ?? undefined} playsInline muted className={imageClassName} />;
  }

  const imageSrc = thumbnailUrl ?? mediaUrl;

  if (!imageSrc) {
    return null;
  }

  return <img src={imageSrc} alt="" className={imageClassName} />;
}
