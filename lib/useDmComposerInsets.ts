"use client";

/**
 * @deprecated Prefer `@/lib/keyboardSystem`.
 */
export {
  useComposerKeyboardStyle as useDmComposerKeyboardInset,
  composerPaddingBottom,
  dmComposerBottomPadding,
} from "@/lib/keyboardSystem";

/** @deprecated Unused absolute-composer path. */
export function readDmComposerKeyboardHeight(): number {
  return 0;
}

/** @deprecated Unused absolute-composer path. */
export function useDmComposerPosition(_options: { onViewportResize?: () => void } = {}) {
  return {
    applyComposerBottom: () => undefined,
    isKeyboardOpen: false,
    messagesPaddingBottom: 0,
    setComposerRef: (_node: HTMLDivElement | null) => undefined,
  };
}
