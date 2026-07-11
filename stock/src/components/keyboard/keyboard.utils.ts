import type { KeyboardLayoutMetrics } from "./keyboard.types";

export const DEFAULT_KEYBOARD_GAP = 16;

export function getKeyboardBottomOffset(
  metrics: KeyboardLayoutMetrics = {},
  gap = DEFAULT_KEYBOARD_GAP,
) {
  return (
    gap +
    (metrics.footerHeight ?? 0) +
    (metrics.tabBarHeight ?? 0) +
    (metrics.safeAreaBottom ?? 0)
  );
}

