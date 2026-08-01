"use client";

import { useState, useEffect } from "react";

export function isMacUser(): boolean {
  if (typeof window === "undefined") return false;
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function useOS() {
  const [os, setOs] = useState<"mac" | "windows" | "linux">("windows");
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const mac = isMacUser();
    setIsMac(mac);
    if (mac) {
      setOs("mac");
    } else if (/win/i.test(navigator.userAgent)) {
      setOs("windows");
    } else {
      setOs("linux");
    }
  }, []);

  return { os, isMac };
}

/**
 * Format key combination for human display based on user OS
 * Example: 'alt+g' -> '⌥G' on macOS, 'Alt+G' on Windows/Linux
 * Example: 'ctrl+a' -> '⌘A' on macOS, 'Ctrl+A' on Windows/Linux
 */
export function formatShortcutForOS(combo: string, isMac: boolean): string {
  if (isMac) {
    return combo
      .replace(/ctrl\+/i, "⌘")
      .replace(/meta\+/i, "⌘")
      .replace(/cmd\+/i, "⌘")
      .replace(/alt\+/i, "⌥")
      .replace(/option\+/i, "⌥")
      .replace(/shift\+/i, "⇧")
      .toUpperCase();
  }
  return combo
    .split("+")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("+");
}
