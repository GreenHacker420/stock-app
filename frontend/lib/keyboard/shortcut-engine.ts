import { isMacUser, formatShortcutForOS } from "./os";

export type ShortcutScope = "GLOBAL" | "PAGE" | "TABLE" | "FORM" | "DIALOG";

export interface ShortcutDefinition {
  id: string;
  key: string; // e.g. "f8", "alt+g", "ctrl+a", "escape", "f3", "f6", "f9", "alt+f8", "ctrl+f8"
  scope: ShortcutScope;
  description: string;
  action: (e: KeyboardEvent) => void;
  preventInInput?: boolean;
  disabled?: boolean;
}

const SCOPE_PRIORITY: Record<ShortcutScope, number> = {
  DIALOG: 5,
  FORM: 4,
  TABLE: 3,
  PAGE: 2,
  GLOBAL: 1,
};

export class ShortcutEngine {
  private shortcuts: ShortcutDefinition[] = [];
  private isListening = false;

  register(def: ShortcutDefinition): () => void {
    // Prevent exact duplicate id registration
    this.shortcuts = this.shortcuts.filter((s) => s.id !== def.id);
    this.shortcuts.push(def);
    return () => {
      this.unregister(def.id);
    };
  }

  unregister(id: string): void {
    this.shortcuts = this.shortcuts.filter((s) => s.id !== id);
  }

  getShortcuts(): ShortcutDefinition[] {
    return [...this.shortcuts];
  }

  clear(): void {
    this.shortcuts = [];
  }

  startListening(): () => void {
    if (this.isListening) return () => {};
    if (typeof window === "undefined") return () => {};

    const handler = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener("keydown", handler);
    this.isListening = true;

    return () => {
      window.removeEventListener("keydown", handler);
      this.isListening = false;
    };
  }

  handleKeyDown = (e: KeyboardEvent): boolean => {
    const target = e.target as HTMLElement | null;
    const isInput =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);

    const combo = this.getComboString(e);

    // Filter active, non-disabled matching shortcuts
    const matching = this.shortcuts.filter((s) => {
      if (s.disabled) return false;

      const keyNorm = s.key.toLowerCase().replace(/cmd\+/g, "ctrl+").replace(/meta\+/g, "ctrl+");
      const comboNorm = combo.toLowerCase();

      if (keyNorm !== comboNorm) return false;

      // Input safety check
      if (isInput) {
        const preventInInput = s.preventInInput !== false;
        if (preventInInput) {
          // Allow Escape to close top layer even from inputs
          if (keyNorm === "esc" || keyNorm === "escape") {
            return true;
          }
          return false;
        }
      }
      return true;
    });

    if (matching.length === 0) return false;

    // Sort by highest priority scope
    matching.sort((a, b) => SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope]);

    const topShortcut = matching[0];
    e.preventDefault();
    topShortcut.action(e);
    return true;
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

export function formatShortcutLabel(combo: string): string {
  const isMac = isMacUser();
  return formatShortcutForOS(combo, isMac);
}
