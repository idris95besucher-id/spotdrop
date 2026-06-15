"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { getSpotDraftStorage, type SpotDraftRecord } from "@/lib/spotDraft";

type SpotDraftPreviewProps = {
  draft: SpotDraftRecord;
  className?: string;
};

export default function SpotDraftPreview({ draft, className = "h-16 w-16" }: SpotDraftPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    void (async () => {
      const storage = getSpotDraftStorage();
      const coverBlob =
        draft.media.mediaType === "video" ? await storage.getDraftBlob(draft.id, "cover") : null;
      const mediaBlob = coverBlob ?? (await storage.getDraftBlob(draft.id, "media"));

      if (!active || !mediaBlob) {
        return;
      }

      objectUrl = URL.createObjectURL(mediaBlob);
      setPreviewUrl(objectUrl);
    })();

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [draft.id, draft.media.mediaType]);

  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-[#050816] ${className}`}>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <MapPin className="h-5 w-5 opacity-50" aria-hidden />
        </div>
      )}
      {draft.media.mediaType === "video" ? (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
          Video
        </span>
      ) : null}
    </div>
  );
}
