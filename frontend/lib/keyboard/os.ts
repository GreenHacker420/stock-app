"use client";

import { useSyncExternalStore } from "react";

type OperatingSystem = "mac" | "windows" | "linux";
interface NavigatorWithUserAgentData extends Navigator { userAgentData?: { platform?: string } }

function readPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const extended = navigator as NavigatorWithUserAgentData;
  return extended.userAgentData?.platform || navigator.platform || navigator.userAgent;
}

function getOSSnapshot(): OperatingSystem {
  const platform = readPlatform();
  if (/mac|iphone|ipad|ipod/i.test(platform)) return "mac";
  if (/win/i.test(platform)) return "windows";
  return "linux";
}

function subscribeOS() { return () => undefined; }

export function isMacUser(): boolean { return getOSSnapshot() === "mac"; }

export function useOS() {
  const os = useSyncExternalStore(subscribeOS, getOSSnapshot, () => "windows" as const);
  return { os, isMac: os === "mac" };
}

export function formatShortcutForOS(combo: string, isMac: boolean): string {
  if (isMac) {
    return combo.replace(/ctrl\+/i, "⌘").replace(/meta\+/i, "⌘").replace(/cmd\+/i, "⌘").replace(/alt\+/i, "⌥").replace(/option\+/i, "⌥").replace(/shift\+/i, "⇧").toUpperCase();
  }
  return combo.split("+").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("+");
}
