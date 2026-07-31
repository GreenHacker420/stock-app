import { useEffect } from "react";

export type ShortcutScope = "GLOBAL" | "PAGE" | "TABLE" | "FORM" | "DIALOG";

export interface ShortcutDefinition {
  id: string;
  key: string; // e.g. "f8", "alt+g", "ctrl+a", "escape", "enter"
  scope: ShortcutScope;
  description: string;
  action: (e: KeyboardEvent) => void;
  preventInInput?: boolean;
}

class ShortcutEngine {
  private shortcuts: ShortcutDefinition[] = [];

  register(def: ShortcutDefinition): () => void {
    this.shortcuts.push(def);
    return () => {
      this.shortcuts = this.shortcuts.filter((s) => s.id !== def.id);
    };
  }

  handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const isInput =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);

    const combo = this.getComboString(e);

    // Scope priorities
    const scopePriority: Record<ShortcutScope, number> = {
      DIALOG: 5,
      FORM: 4,
      TABLE: 3,
      PAGE: 2,
      GLOBAL: 1,
    };

    // Filter matching shortcuts
    const matching = this.shortcuts.filter((s) => {
      if (s.key.toLowerCase() !== combo.toLowerCase()) return false;
      if (isInput && s.preventInInput !== false) {
        // Allow Esc and Enter and function keys in inputs
        const isFunctionKey = /^f\d+$/i.test(e.key);
        const isAllowedSpecial = e.key === "Escape" || (e.ctrlKey && e.key === "a");
        if (!isFunctionKey && !isAllowedSpecial && e.key !== "g" && !e.altKey) {
          return false;
        }
      }
      return true;
    });

    if (matching.length === 0) return;

    // Sort by highest priority scope
    matching.sort((a, b) => scopePriority[b.scope] - scopePriority[a.scope]);

    const topShortcut = matching[0];
    e.preventDefault();
    topShortcut.action(e);
  };

  private getComboString(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");

    let keyName = e.key.toLowerCase();
    if (keyName === " ") keyName = "space";
    if (keyName === "escape") keyName = "esc";

    if (!["control", "alt", "shift", "meta"].includes(keyName)) {
      parts.push(keyName);
    }

    return parts.join("+");
  }
}

export const shortcutEngine = new ShortcutEngine();

export function useShortcut(def: ShortcutDefinition) {
  useEffect(() => {
    return shortcutEngine.register(def);
  }, [def.id, def.key, def.scope, def.description, def.action]);
}

/**
 * Format shortcut key string into user friendly OS badge (macOS ⌥G / ⌘A vs Windows Alt+G / Ctrl+A)
 */
export function formatShortcutLabel(combo: string): string {
  const isMac = typeof window !== "undefined" && /mac/i.test(navigator.userAgent);
  if (isMac) {
    return combo
      .replace(/ctrl\+/i, "⌘")
      .replace(/alt\+/i, "⌥")
      .replace(/shift\+/i, "⇧")
      .toUpperCase();
  }
  return combo
    .split("+")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("+");
}
