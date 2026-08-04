"use client";

import { useEffect, useState } from "react";
import { fetchOfficialChannelSignedMediaUrl } from "@/lib/officialChannel";

export default function OfficialChannelPostImage({
  imagePath,
  alt,
}: {
  imagePath: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await fetchOfficialChannelSignedMediaUrl(imagePath);

      if (active && result.url) {
        setUrl(result.url);
      }
    })();

    return () => {
      active = false;
    };
  }, [imagePath]);

  if (!url) {
    return (
      <div className="mt-3 h-44 w-full animate-pulse rounded-2xl bg-white/5" aria-hidden />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="mt-3 max-h-80 w-full rounded-2xl object-cover"
    />
  );
}
