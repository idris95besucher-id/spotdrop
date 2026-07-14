export type SpotCarouselSlide = {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string | null;
  /** Published / preview: play video without audio when true. */
  audioMuted?: boolean;
  /** Wide multi-frame panorama — enable intra-image horizontal pan. */
  isPanorama?: boolean;
  /** Retry source if `mediaUrl` (a native webPath) fails to load — see CarouselVideoSlide. */
  fallbackMediaUrl?: string | null;
};
