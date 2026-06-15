export type VisitTab = "explore" | "nearby" | "map";

export const VISIT_TABS: VisitTab[] = ["explore", "map", "nearby"];

export function parseVisitTab(value: string | null | undefined): VisitTab {
  if (value === "nearby" || value === "map") {
    return value;
  }

  return "explore";
}

export function visitTabHref(tab: VisitTab) {
  if (tab === "explore") {
    return "/visit";
  }

  return `/visit?tab=${tab}`;
}
