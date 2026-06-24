"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, Loader2, MapPin, Video, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { localizeCityName, localizeCountryName } from "@/lib/i18n/localizeGeo";
import { BERN_DISCOVERY_REGION_SLUG } from "@/lib/discoveryMap";
import { createStory, type StoryVisibility } from "@/lib/stories";
import {
  getStoryMediaType,
  NOT_SIGNED_IN_UPLOAD_MESSAGE,
  readVideoDurationSeconds,
  STORY_MAX_VIDEO_SECONDS,
  uploadStoryMedia,
} from "@/lib/storyMedia";
import { supabase } from "@/lib/supabaseClient";

type CountryOption = { id: string; name: string; slug: string };
type CityOption = { id: string; name: string; slug: string; country_id: string };
type PlaceOption = { id: string; name: string; slug: string };

type CreateStoryFormProps = {
  userId: string;
  defaultCityId?: string | null;
  onCreated: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  profileMode?: boolean;
};

export default function CreateStoryForm({
  userId,
  defaultCityId,
  onCreated,
  isOpen: isOpenControlled,
  onClose,
  profileMode = false,
}: CreateStoryFormProps) {
  const { locale } = useI18n();
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isControlled = isOpenControlled !== undefined;
  const isOpen = isControlled ? Boolean(isOpenControlled) : isOpenInternal;

  const closeForm = () => {
    if (isControlled) {
      onClose?.();
    } else {
      setIsOpenInternal(false);
    }
  };
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<StoryVisibility>("public");
  const [shareInRoom, setShareInRoom] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [countrySlug, setCountrySlug] = useState("switzerland");
  const [cityId, setCityId] = useState(defaultCityId ?? "");
  const [placeId, setPlaceId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void supabase
      .from("countries")
      .select("id, name, slug")
      .order("name", { ascending: true })
      .then(({ data }) => setCountries((data ?? []) as CountryOption[]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !countrySlug) {
      return;
    }

    void supabase
      .from("countries")
      .select("id")
      .eq("slug", countrySlug)
      .maybeSingle()
      .then(({ data: country }) => {
        if (!country?.id) {
          setCities([]);
          return;
        }

        return supabase
          .from("cities")
          .select("id, name, slug, country_id")
          .eq("country_id", country.id)
          .order("name", { ascending: true })
          .then(({ data }) => {
            const rows = (data ?? []) as CityOption[];
            setCities(rows);
            if (!cityId && defaultCityId) {
              setCityId(defaultCityId);
            } else if (!cityId && rows.length > 0) {
              const bern = rows.find((c) => c.slug === "bern");
              setCityId(bern?.id ?? rows[0].id);
            }
          });
      });
  }, [isOpen, countrySlug, cityId, defaultCityId]);

  useEffect(() => {
    if (!shareInRoom || !isOpen) {
      return;
    }

    void supabase
      .from("discovery_regions")
      .select("id")
      .eq("slug", BERN_DISCOVERY_REGION_SLUG)
      .maybeSingle()
      .then(({ data: region }) => {
        if (!region?.id) {
          setPlaces([]);
          return;
        }

        return supabase
          .from("discovery_places")
          .select("id, name, slug")
          .eq("region_id", region.id)
          .order("sort_order", { ascending: true })
          .then(({ data }) => {
            const rows = (data ?? []) as PlaceOption[];
            setPlaces(rows);
            if (!placeId && rows.length > 0) {
              setPlaceId(rows[0].id);
            }
          });
      });
  }, [shareInRoom, isOpen, placeId]);

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

  const handleMediaChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const nextType = getStoryMediaType(file);

    if (!nextType) {
      setError("Stories support photos and short videos only.");
      return;
    }

    if (nextType === "video") {
      const duration = await readVideoDurationSeconds(file);

      if (duration !== null && duration > STORY_MAX_VIDEO_SECONDS) {
        setError(`Videos must be ${STORY_MAX_VIDEO_SECONDS} seconds or less.`);
        return;
      }
    }

    resetMedia();
    setMediaFile(file);
    setMediaType(nextType);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!userId) {
      setError(NOT_SIGNED_IN_UPLOAD_MESSAGE);
      return;
    }

    if (!mediaFile || !mediaType) {
      setError("Add a photo or short video for your story.");
      return;
    }

    const shareToRoom = !profileMode && shareInRoom;

    if (shareToRoom && (!cityId || !placeId)) {
      setError("Choose a city and place for Share in Room City.");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const upload = await uploadStoryMedia(userId, mediaFile);
      const result = await createStory({
        userId,
        mediaUrl: upload.mediaUrl,
        mediaType: upload.mediaType,
        caption: caption.trim() || "Story",
        visibility,
        sharedToRoom: shareToRoom,
        cityId: shareToRoom ? cityId : null,
        placeId: shareToRoom ? placeId : null,
      });

      if (result.error) {
        setError(result.error);
        setPublishing(false);
        return;
      }

      setCaption("");
      setShareInRoom(false);
      resetMedia();
      closeForm();
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to publish story.");
    }

    setPublishing(false);
  };

  if (!isOpen) {
    if (isControlled) {
      return null;
    }

    return (
      <button
        type="button"
        onClick={() => setIsOpenInternal(true)}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-6 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
      >
        <ImagePlus className="h-4 w-4" aria-hidden />
        Add Story
      </button>
    );
  }

  const formBody = (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="w-full max-w-sm space-y-3 rounded-3xl border border-white/10 bg-slate-950 p-4 text-left shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">New story</p>
        <button
          type="button"
          onClick={() => {
            closeForm();
            resetMedia();
            setError(null);
          }}
          className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {!profileMode ? (
        <p className="text-xs text-slate-400">Videos max {STORY_MAX_VIDEO_SECONDS}s.</p>
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => void handleMediaChange(e)} />

      {mediaPreviewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/10">
          {mediaType === "video" ? (
            <video src={mediaPreviewUrl} className="max-h-48 w-full object-cover" controls playsInline />
          ) : (
            <img src={mediaPreviewUrl} alt="" className="max-h-48 w-full object-cover" />
          )}
          <button
            type="button"
            onClick={resetMedia}
            className="absolute right-2 top-2 rounded-full bg-slate-950/80 p-1.5 text-white"
            aria-label="Remove"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-8 text-sm text-slate-300 hover:border-cyan-300/40"
        >
          <Video className="h-4 w-4" aria-hidden />
          Photo or video
        </button>
      )}

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional)"
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
      />

      <select
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as StoryVisibility)}
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white"
      >
        <option value="public">Public</option>
        <option value="friends">Friends</option>
        <option value="private">Private</option>
      </select>

      {!profileMode ? (
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
        <input
          type="checkbox"
          checked={shareInRoom}
          onChange={(e) => setShareInRoom(e.target.checked)}
          className="h-4 w-4 rounded border-white/20"
        />
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <MapPin className="h-4 w-4 text-cyan-300" aria-hidden />
          Share in Room City
        </span>
      </label>
      ) : null}

      {shareInRoom && !profileMode ? (
        <div className="space-y-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3">
          <select
            value={countrySlug}
            onChange={(e) => setCountrySlug(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {countries.map((c) => (
              <option key={c.id} value={c.slug}>
                {localizeCountryName(locale, { slug: c.slug, name: c.name })}
              </option>
            ))}
          </select>
          <select
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {localizeCityName(locale, {
                  slug: c.slug,
                  name: c.name,
                  countrySlug: countrySlug || undefined,
                })}
              </option>
            ))}
          </select>
          <select
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={publishing}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-cyan-400 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
      >
        {publishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {publishing ? "Publishing…" : "Share story"}
      </button>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </form>
  );

  if (profileMode || isControlled) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
        {formBody}
      </div>
    );
  }

  return formBody;
}
