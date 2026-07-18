"use client";

import { useEffect, useState, type RefObject } from "react";

type UseIntersectionVisibleOptions = {
  /** Fraction of the target that must be visible to count as "intersecting". */
  threshold?: number;
  /** Expands (positive values) or shrinks the root's bounding box before intersection is computed. */
  rootMargin?: string;
  enabled?: boolean;
};

/**
 * Tracks whether `ref`'s element currently intersects the viewport, per the given
 * threshold/rootMargin. Two call sites in the gallery feed reuse this with different
 * settings from the same underlying primitive: a wide `rootMargin` (~one screen) to
 * detect "coming up soon" for prefetch, and a tight `threshold` with no margin to detect
 * "mostly on screen" for video autoplay.
 */
export function useIntersectionVisible(
  ref: RefObject<Element | null>,
  { threshold = 0, rootMargin = "0px", enabled = true }: UseIntersectionVisibleOptions = {}
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = ref.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref, threshold, rootMargin, enabled]);

  return isVisible;
}
