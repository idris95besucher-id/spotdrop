export type SpotCarouselSlide = {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  posterUrl?: string | null;
  /** Published / preview: play video without audio when true. */
  audioMuted?: boolean;
};
