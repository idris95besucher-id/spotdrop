import { MapPin } from "lucide-react";
import {
  buildSpotMapsUrl,
  formatSpotLocationDisplay,
  hasSpotLocationData,
  type SpotLocationDisplayFields,
} from "@/lib/spotLocationDisplay";

type SpotLocationLinkProps = {
  location: SpotLocationDisplayFields;
  className?: string;
};

export default function SpotLocationLink({ location, className = "" }: SpotLocationLinkProps) {
  if (!hasSpotLocationData(location)) {
    return null;
  }

  const label = formatSpotLocationDisplay(location);
  const mapsUrl = buildSpotMapsUrl(location);

  if (!label && !mapsUrl) {
    return null;
  }

  const content = (
    <>
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" strokeWidth={1.75} aria-hidden />
      <span className="leading-snug">{label ?? "View on map"}</span>
    </>
  );

  const sharedClassName = `inline-flex max-w-full items-start gap-1.5 text-sm font-medium text-cyan-200/95 ${className}`;

  if (!mapsUrl) {
    return <p className={sharedClassName}>{content}</p>;
  }

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${sharedClassName} transition hover:text-cyan-100 active:opacity-80`}
      onClick={(event) => event.stopPropagation()}
    >
      {content}
    </a>
  );
}
