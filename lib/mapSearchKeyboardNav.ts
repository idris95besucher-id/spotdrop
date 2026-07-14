import { setChromeNavHidden } from "@/lib/keyboardSystem";

/**
 * @deprecated Prefer `useChromeNavHidden("map-search-focus", …)` from `@/lib/keyboardSystem`.
 */
export function setMapSearchKeyboardNavHidden(hidden: boolean) {
  setChromeNavHidden("map-search-focus", hidden);
}
