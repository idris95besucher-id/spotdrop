"use client";

type PostMediaViewerProps = {
  mediaUrl: string;
  mediaType: "image" | "video";
  alt?: string;
};

export default function PostMediaViewer({ mediaUrl, mediaType, alt = "" }: PostMediaViewerProps) {
  if (mediaType === "video") {
    return (
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-black">
        {/* Native `controls` (not autoplay): iOS only blocks *muted* autoplay,
            not a user tapping the built-in play button, so this plays with
            sound on first tap without needing a custom play-button overlay. */}
        <video
          src={mediaUrl}
          poster={undefined}
          controls
          playsInline
          disablePictureInPicture
          aria-label={alt || "Video"}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <img
      src={mediaUrl}
      alt={alt}
      className="w-full rounded-2xl object-cover"
      loading="lazy"
      decoding="async"
    />
  );
}
