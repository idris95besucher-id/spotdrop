import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function canNavigateBack() {
  return typeof window !== "undefined" && window.history.length > 1;
}

/** Pop the navigation stack — returns to the previous screen when possible. */
export function navigateBack(router: AppRouterInstance, fallbackHref?: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (window.history.length > 1) {
    router.back();
    return;
  }

  if (fallbackHref) {
    router.push(fallbackHref);
  }
}
