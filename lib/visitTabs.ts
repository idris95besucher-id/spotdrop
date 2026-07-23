export type VisitTab = "explore" | "nearby" | "map";

export const VISIT_TABS: VisitTab[] = ["explore", "map", "nearby"];

export function parseVisitTab(value: string | null | undefined): VisitTab {
  if (value === "nearby" || value === "map" || value === "explore") {
    return value;
  }

  return "explore";
}

export function visitTabHref(tab: VisitTab) {
  // Always include ?tab= so App Router/Capacitor replaces search params when
  // switching between Explore and Map (same /visit pathname).
  return `/visit?tab=${tab}`;
}
