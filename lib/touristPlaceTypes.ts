export type TouristPlaceCategory =
  | "tourist_attraction"
  | "landmark"
  | "museum"
  | "park"
  | "viewpoint"
  | "historic_site"
  | "monument"
  | "mountain"
  | "lake"
  | "river"
  | "bridge"
  | "old_town"
  | "castle"
  | "public_square";

export type CuratedTouristPlace = {
  id: string;
  rank?: number;
  name: string;
  address: string;
  description: string | null;
  imageUrl?: string | null;
  latitude: number;
  longitude: number;
  city: string;
  region: string | null;
  country: string;
  categories: TouristPlaceCategory[];
  keywords: string[];
};
