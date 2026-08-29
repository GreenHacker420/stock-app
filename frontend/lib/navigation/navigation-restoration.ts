import { activePointerStore } from "@/lib/focus/active-pointer-store";
import type { NavigationFrame } from "./navigation-frame";

let pendingFrame: NavigationFrame | null = null;

export function queueNavigationRestoration(frame: NavigationFrame): void {
  pendingFrame = frame;
}

export function peekNavigationRestoration(route?: string): NavigationFrame | undefined {
  if (!pendingFrame) return undefined;
  if (route && pendingFrame.route !== route) return undefined;
  return pendingFrame;
}

export function consumeNavigationRestoration(route?: string): NavigationFrame | undefined {
  const frame = peekNavigationRestoration(route);
  if (!frame) return undefined;
  pendingFrame = null;
  return frame;
}

export function clearNavigationRestoration(): void {
  pendingFrame = null;
}

export function restoreNavigationFrame(frame: NavigationFrame): void {
  activePointerStore.setPointer(frame.activePointer ?? null);
  activePointerStore.setSelection(frame.selectedIds ?? []);
  if (typeof frame.scrollOffset === "number") {
    requestAnimationFrame(() => window.scrollTo({ top: frame.scrollOffset }));
  }
}
