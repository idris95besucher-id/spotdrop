"use client";

import { Megaphone } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import NavigationStackScreen from "@/components/NavigationStackScreen";
import Shell from "@/components/Shell";
import { MOBILE_BOTTOM_NAV_PADDING, MOBILE_MAIN_SCROLL_CLASS } from "@/lib/mobileLayout";

/**
 * Read-only placeholder for the official SpotDrop channel. Stage A: no backend
 * yet, so this only establishes the screen and its navigation entry point.
 */
export default function OfficialChannelView() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} flushTop fixedLayout>
      <NavigationStackScreen fallbackHref="/profile">
        <MobileSecondaryHeader title={t("profile.officialChannelCardTitle")} backHref="/profile" />

        <div
          data-mobile-main-scroll=""
          className={`${MOBILE_MAIN_SCROLL_CLASS} ${MOBILE_BOTTOM_NAV_PADDING}`}
        >
          <div className="mx-auto flex w-full max-w-lg flex-col items-center px-6 py-10 text-center">
            <p className="text-2xl font-bold tracking-tight text-white">
              Spot<span className="text-primary">Drop</span>
            </p>

            <div className="mt-6 flex items-center gap-1.5">
              <p className="text-lg font-semibold text-white">{t("profile.officialChannelCardTitle")}</p>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0"
                role="img"
                aria-label="Official verified account"
              >
                <path
                  fill="#1687F8"
                  d="M23 12l-2.44-2.79.34-3.69-3.61-.82L15.4 1.5 12 2.96 8.6 1.5 6.71 4.69 3.1 5.51l.34 3.69L1 12l2.44 2.8-.34 3.69 3.61.82L8.6 22.5 12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12z"
                />
                <path
                  d="m8.6 12.2 2.15 2.15 4.65-4.7"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
              {t("officialChannel.postingRestriction")}
            </p>

            <div className="mt-16 flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Megaphone className="h-7 w-7 text-primary" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-muted">
                {t("officialChannel.comingSoon")}
              </p>
            </div>
          </div>
        </div>
      </NavigationStackScreen>
    </Shell>
  );
}
