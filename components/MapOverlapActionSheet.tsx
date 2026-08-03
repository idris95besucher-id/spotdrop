"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, MapPinned, Users, X } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import UsernameWithVerification from "@/components/UsernameWithVerification";
import { useI18n } from "@/components/I18nProvider";
import { getMapSpotPinPreviewUrl, getMapSpotPinTitle } from "@/lib/mapSpotPin";
import type { MapSpotPin } from "@/lib/spots";
import type { LiveMapUser } from "@/lib/userLiveLocation";

type MapOverlapActionSheetProps = {
  users: LiveMapUser[];
  spots: MapSpotPin[];
  embedded?: boolean;
  onOpenUser: (user: LiveMapUser) => void;
  onOpenSpot: (pin: MapSpotPin) => void;
  onClose: () => void;
};

type SheetView = "root" | "users" | "spots";

export default function MapOverlapActionSheet({
  users,
  spots,
  embedded = false,
  onOpenUser,
  onOpenSpot,
  onClose,
}: MapOverlapActionSheetProps) {
  const { t } = useI18n();
  const [view, setView] = useState<SheetView>("root");

  const title = useMemo(() => {
    if (view === "users") {
      return t("map.overlapChooseUser");
    }

    if (view === "spots") {
      return t("map.overlapChooseSpot");
    }

    return t("map.overlapTitle");
  }, [t, view]);

  const handleOpenUser = (user: LiveMapUser) => {
    onOpenUser(user);
  };

  const handleOpenSpot = (pin: MapSpotPin) => {
    onOpenSpot(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label={t("map.closeOverlap")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-overlap-sheet-title"
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl shadow-black/50"
        style={{
          maxHeight: "min(70dvh, 28rem)",
          paddingBottom: embedded
            ? "max(1rem, calc(env(safe-area-inset-bottom) + 54px))"
            : "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex shrink-0 justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-white/20" aria-hidden />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {view !== "root" ? (
              <button
                type="button"
                onClick={() => setView("root")}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label={t("common.back")}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <h2 id="map-overlap-sheet-title" className="truncate text-[15px] font-semibold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3">
          {view === "root" ? (
            <>
              {spots.length === 1 ? (
                <button
                  type="button"
                  onClick={() => handleOpenSpot(spots[0]!)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-3.5 py-3 text-left transition hover:bg-cyan-500/15"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-400/90 bg-slate-800">
                    {getMapSpotPinPreviewUrl(spots[0]!) ? (
                      <img
                        src={getMapSpotPinPreviewUrl(spots[0]!)!}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <MapPinned className="h-5 w-5 text-cyan-300" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{t("map.overlapOpenSpot")}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {getMapSpotPinTitle(spots[0]!)}
                    </span>
                  </span>
                </button>
              ) : spots.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setView("spots")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-3.5 py-3 text-left transition hover:bg-cyan-500/15"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-cyan-400/90 bg-slate-900 text-cyan-200">
                    <MapPinned className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {t("map.overlapSpotsCount", { count: spots.length })}
                    </span>
                    <span className="block text-xs text-slate-400">{t("map.overlapChooseSpot")}</span>
                  </span>
                </button>
              ) : null}

              {users.length === 1 ? (
                <button
                  type="button"
                  onClick={() => handleOpenUser(users[0]!)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3.5 py-3 text-left transition hover:bg-violet-500/15"
                >
                  <ProfileAvatar
                    src={users[0]!.avatar_url}
                    sizeClassName="h-11 w-11"
                    iconClassName="h-5 w-5"
                    className="border-2 border-violet-400/80 bg-slate-800"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">{t("map.overlapOpenUser")}</span>
                    <UsernameWithVerification
                      username={`@${users[0]!.username}`}
                      isVerified={users[0]!.is_verified}
                      className="text-xs text-slate-400"
                      iconSize={12}
                    />
                  </span>
                </button>
              ) : users.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setView("users")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-3.5 py-3 text-left transition hover:bg-violet-500/15"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-violet-400/80 bg-slate-900 text-violet-200">
                    <Users className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {t("map.overlapUsersCount", { count: users.length })}
                    </span>
                    <span className="block text-xs text-slate-400">{t("map.overlapChooseUser")}</span>
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className="mt-1 flex w-full items-center justify-center rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
              >
                {t("common.cancel")}
              </button>
            </>
          ) : null}

          {view === "users" ? (
            <ul className="space-y-1.5">
              {users.map((user) => (
                <li key={user.user_id}>
                  <button
                    type="button"
                    onClick={() => handleOpenUser(user)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
                  >
                    <ProfileAvatar
                      src={user.avatar_url}
                      sizeClassName="h-10 w-10"
                      iconClassName="h-4 w-4"
                      className="border-2 border-violet-400/80 bg-slate-800"
                    />
                    <UsernameWithVerification
                      username={`@${user.username}`}
                      isVerified={user.is_verified}
                      className="min-w-0 flex-1 text-sm font-semibold text-white"
                      iconSize={14}
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {view === "spots" ? (
            <ul className="space-y-1.5">
              {spots.map((pin) => {
                const preview = getMapSpotPinPreviewUrl(pin);

                return (
                  <li key={pin.id}>
                    <button
                      type="button"
                      onClick={() => handleOpenSpot(pin)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-400/90 bg-slate-800">
                        {preview ? (
                          <img src={preview} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <MapPinned className="h-4 w-4 text-cyan-300" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">
                          {getMapSpotPinTitle(pin)}
                        </span>
                        {pin.username ? (
                          <UsernameWithVerification
                            username={`@${pin.username}`}
                            isVerified={pin.is_verified}
                            className="text-xs text-slate-400"
                            iconSize={12}
                          />
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
