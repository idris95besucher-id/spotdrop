import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Car,
  CircleHelp,
  Coffee,
  Construction,
  Eye,
  MapPin,
  ParkingCircle,
  PartyPopper,
  Shield,
  UtensilsCrossed,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/messages";

export const MAP_MARK_CATEGORY_KEYS = [
  "traffic",
  "road_closed",
  "police",
  "parking",
  "danger",
  "event",
  "viewpoint",
  "restaurant",
  "cafe",
  "question",
  "general",
] as const;

export type MapMarkCategoryKey = (typeof MAP_MARK_CATEGORY_KEYS)[number];

export const DEFAULT_MAP_MARK_CATEGORY: MapMarkCategoryKey = "general";

const CATEGORY_LABEL_KEYS: Record<MapMarkCategoryKey, TranslationKey> = {
  traffic: "map.markCategory.traffic",
  road_closed: "map.markCategory.roadClosed",
  police: "map.markCategory.police",
  parking: "map.markCategory.parking",
  danger: "map.markCategory.danger",
  event: "map.markCategory.event",
  viewpoint: "map.markCategory.viewpoint",
  restaurant: "map.markCategory.restaurant",
  cafe: "map.markCategory.cafe",
  question: "map.markCategory.question",
  general: "map.markCategory.general",
};

const CATEGORY_ICONS: Record<MapMarkCategoryKey, LucideIcon> = {
  traffic: Car,
  road_closed: Construction,
  police: Shield,
  parking: ParkingCircle,
  danger: AlertTriangle,
  event: PartyPopper,
  viewpoint: Eye,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  question: CircleHelp,
  general: MapPin,
};

export function isMapMarkCategoryKey(value: string | null | undefined): value is MapMarkCategoryKey {
  return Boolean(value && (MAP_MARK_CATEGORY_KEYS as readonly string[]).includes(value));
}

export function normalizeMapMarkCategory(value: string | null | undefined): MapMarkCategoryKey {
  return isMapMarkCategoryKey(value) ? value : DEFAULT_MAP_MARK_CATEGORY;
}

export function mapMarkCategoryLabelKey(category: MapMarkCategoryKey): TranslationKey {
  return CATEGORY_LABEL_KEYS[category];
}

export function mapMarkCategoryIcon(category: MapMarkCategoryKey): LucideIcon {
  return CATEGORY_ICONS[category];
}

/** Soft chip accents — color the chip only, never the whole Mark card. */
export type MapMarkCategoryAccent = {
  chipClass: string;
  iconClass: string;
};

const CATEGORY_ACCENTS: Record<MapMarkCategoryKey, MapMarkCategoryAccent> = {
  traffic: {
    chipClass: "bg-amber-500/12 text-amber-100/90",
    iconClass: "text-amber-300/90",
  },
  road_closed: {
    chipClass: "bg-red-500/12 text-red-100/90",
    iconClass: "text-red-300/90",
  },
  police: {
    chipClass: "bg-sky-500/12 text-sky-100/90",
    iconClass: "text-sky-300/90",
  },
  parking: {
    chipClass: "bg-blue-500/12 text-blue-100/90",
    iconClass: "text-blue-300/90",
  },
  danger: {
    chipClass: "bg-rose-500/14 text-rose-100/90",
    iconClass: "text-rose-300/90",
  },
  event: {
    chipClass: "bg-fuchsia-500/12 text-fuchsia-100/90",
    iconClass: "text-fuchsia-300/90",
  },
  viewpoint: {
    chipClass: "bg-violet-500/12 text-violet-100/90",
    iconClass: "text-violet-300/90",
  },
  restaurant: {
    chipClass: "bg-orange-500/12 text-orange-100/90",
    iconClass: "text-orange-300/90",
  },
  cafe: {
    chipClass: "bg-amber-700/20 text-amber-100/85",
    iconClass: "text-amber-200/85",
  },
  question: {
    chipClass: "bg-slate-400/12 text-slate-200/90",
    iconClass: "text-slate-300/90",
  },
  general: {
    chipClass: "bg-cyan-500/10 text-cyan-100/85",
    iconClass: "text-cyan-300/80",
  },
};

export function mapMarkCategoryAccent(category: MapMarkCategoryKey): MapMarkCategoryAccent {
  return CATEGORY_ACCENTS[category];
}
