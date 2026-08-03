"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { useI18n } from "@/components/I18nProvider";
import type { GalleryAllowedViewer } from "@/lib/profileGalleryAllowedViewers";
import { filterPeopleByUsername, loadPeopleSearchCatalog } from "@/lib/peopleSearch";
import { publicProfileUsername } from "@/lib/publicProfile";

type GalleryAllowedUsersPickerProps = {
  ownerUserId: string;
  selected: GalleryAllowedViewer[];
  disabled?: boolean;
  onChange: (next: GalleryAllowedViewer[]) => void;
};

export default function GalleryAllowedUsersPicker({
  ownerUserId,
  selected,
  disabled = false,
  onChange,
}: GalleryAllowedUsersPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<
    Array<{ id: string; username: string; avatar_url: string | null; is_verified: boolean | null }>
  >([]);

  useEffect(() => {
    let cancelled = false;

    void loadPeopleSearchCatalog().then((result) => {
      if (cancelled) {
        return;
      }

      if (result.error) {
        setCatalogError(result.error);
        setProfiles([]);
      } else {
        setCatalogError(null);
        setProfiles(
          result.catalog.profiles
            .filter((profile) => profile.id !== ownerUserId)
            .map((profile) => ({
              id: profile.id,
              username: profile.username,
              avatar_url: profile.avatar_url ?? null,
              is_verified: profile.is_verified ?? null,
            }))
        );
      }

      setLoadingCatalog(false);
    });

    return () => {
      cancelled = true;
    };
  }, [ownerUserId]);

  const selectedIds = useMemo(() => new Set(selected.map((viewer) => viewer.id)), [selected]);

  const searchResults = useMemo(() => {
    if (!query.trim()) {
      return [];
    }

    return filterPeopleByUsername(profiles, query)
      .filter((profile) => profile.id !== ownerUserId)
      .slice(0, 12);
  }, [ownerUserId, profiles, query]);

  const addViewer = (profile: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  }) => {
    if (disabled || selectedIds.has(profile.id)) {
      return;
    }

    onChange([
      ...selected,
      {
        id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        is_verified: profile.is_verified,
      },
    ]);
    setQuery("");
  };

  const removeViewer = (viewerId: string) => {
    if (disabled) {
      return;
    }

    onChange(selected.filter((viewer) => viewer.id !== viewerId));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
      <p className="text-xs leading-relaxed text-muted">{t("settings.galleryPrivacy.selectedHint")}</p>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((viewer) => (
            <span
              key={viewer.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2 text-xs font-medium text-white"
            >
              <ProfileAvatar
                src={viewer.avatar_url}
                sizeClassName="h-6 w-6"
                iconClassName="h-3.5 w-3.5"
                className="bg-slate-800"
              />
              <UsernameWithVerification
                username={`@${publicProfileUsername(viewer.username)}`}
                isVerified={viewer.is_verified}
                iconSize={12}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeViewer(viewer.id)}
                className="rounded-full p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label={t("settings.galleryPrivacy.removeSelected", {
                  user: publicProfileUsername(viewer.username),
                })}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">{t("settings.galleryPrivacy.selectedEmpty")}</p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="search"
          value={query}
          disabled={disabled || loadingCatalog}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.galleryPrivacy.searchUsers")}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-300/20 disabled:opacity-50"
        />
      </div>

      {loadingCatalog ? (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t("common.loading")}
        </div>
      ) : null}

      {catalogError ? (
        <p className="px-1 text-xs text-red-300">{catalogError}</p>
      ) : null}

      {query.trim() ? (
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-500">{t("settings.galleryPrivacy.noUsersFound")}</p>
          ) : (
            searchResults.map((profile) => {
              const isSelected = selectedIds.has(profile.id);

              return (
                <button
                  key={profile.id}
                  type="button"
                  disabled={disabled || isSelected}
                  onClick={() =>
                    addViewer({
                      id: profile.id,
                      username: profile.username,
                      avatar_url: profile.avatar_url ?? null,
                      is_verified: profile.is_verified ?? null,
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ProfileAvatar
                    src={profile.avatar_url}
                    sizeClassName="h-9 w-9"
                    iconClassName="h-4 w-4"
                    className="bg-slate-800"
                  />
                  <span className="min-w-0 flex-1">
                    <UsernameWithVerification
                      username={`@${publicProfileUsername(profile.username)}`}
                      isVerified={profile.is_verified}
                      className="text-sm font-medium text-white"
                      iconSize={14}
                    />
                    {isSelected ? (
                      <span className="text-xs text-cyan-300">{t("settings.galleryPrivacy.alreadySelected")}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
