"use client";

import { MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  formatSpotLocationDisplay,
  hasSpotCoordinates,
  hasSpotLocationData,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";
import { useNavigationAppChooser } from "@/lib/useNavigationAppChooser";

type SpotLocationLinkProps = {
  location: SpotLocationDisplayFields;
  className?: string;
};

export default function SpotLocationLink({ location, className = "" }: SpotLocationLinkProps) {
  const { locale } = useI18n();
  const navigationChooser = useNavigationAppChooser();

  if (!hasSpotLocationData(location)) {
    return null;
  }

  const label = formatSpotLocationDisplay(location, locale);
  const canNavigate = hasSpotCoordinates(location);

  if (!label && !canNavigate) {
    return null;
  }

  const content = (
    <>
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" strokeWidth={1.75} aria-hidden />
      <span className="leading-snug">{label ?? "View on map"}</span>
    </>
  );

  const sharedClassName = `inline-flex max-w-full items-start gap-1.5 text-sm font-medium text-cyan-200/95 ${className}`;

  if (!canNavigate) {
    return <p className={sharedClassName}>{content}</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          navigationChooser.open({
            latitude: Number(location.spot_latitude),
            longitude: Number(location.spot_longitude),
            label: label ?? undefined,
          });
        }}
        className={`${sharedClassName} transition hover:text-cyan-100 active:opacity-80`}
      >
        {content}
      </button>

      {navigationChooser.sheet}
    </>
  );
}
