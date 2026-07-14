import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const BACK_STACK_KEY = "spotdrop:nav-back-stack";
const MAX_STACK = 40;

type NavigateBackOptions = {
  /**
   * When true, always use fallbackHref (deterministic screen exits).
   * Use for Visit rooms / DMs where the parent route is known.
   */
  preferFallback?: boolean;
};

let navigationLockUntil = 0;

function now() {
  return Date.now();
}

function isNavigationLocked() {
  return now() < navigationLockUntil;
}

function lockNavigation(ms = 450) {
  navigationLockUntil = now() + ms;
}

function currentLocationKey() {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.pathname}${window.location.search}`;
}

function readStack(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = sessionStorage.getItem(BACK_STACK_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(BACK_STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
  } catch {
    // Ignore quota / private mode.
  }
}

/** Record the active path so later back actions can return in-app. */
export function recordNavigationPath(pathWithSearch?: string) {
  if (typeof window === "undefined") {
    return;
  }

  const next = pathWithSearch ?? currentLocationKey();

  if (!next || next === "/") {
    return;
  }

  const stack = readStack();
  const top = stack[stack.length - 1];

  if (top === next) {
    return;
  }

  stack.push(next);
  writeStack(stack);
}

function popPreviousPath(current: string) {
  const stack = readStack();

  while (stack.length > 0 && stack[stack.length - 1] === current) {
    stack.pop();
  }

  const previous = stack.pop() ?? null;
  writeStack(stack);
  return previous;
}

/** True when we have a previous in-app path in our stack (not just history.length). */
export function canNavigateBack() {
  if (typeof window === "undefined") {
    return false;
  }

  const current = currentLocationKey();
  const stack = readStack();
  const previous = [...stack].reverse().find((entry) => entry !== current);
  return Boolean(previous);
}

function goToHref(router: AppRouterInstance, href: string) {
  lockNavigation();
  router.push(href);
}

/**
 * Shared SpotDrop back navigation.
 * - Prefer explicit fallback when requested (Visit rooms, DM, etc.).
 * - Else pop the in-app navigation stack.
 * - Else use fallbackHref.
 * - Last resort: history.back() only when no fallback exists.
 */
export function navigateBack(
  router: AppRouterInstance,
  fallbackHref?: string,
  options?: NavigateBackOptions
) {
  if (typeof window === "undefined" || isNavigationLocked()) {
    return;
  }

  if (options?.preferFallback && fallbackHref) {
    goToHref(router, fallbackHref);
    return;
  }

  const current = currentLocationKey();
  const previous = popPreviousPath(current);

  if (previous && previous !== current) {
    goToHref(router, previous);
    return;
  }

  if (fallbackHref) {
    goToHref(router, fallbackHref);
    return;
  }

  if (window.history.length > 1) {
    lockNavigation();
    router.back();
  }
}
