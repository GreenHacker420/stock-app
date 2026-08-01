"use client";

import { useEffect, useCallback } from "react";
import { focusRegistry } from "./focus-registry";
import { editableGridController } from "./EditableGridController";
import type { InteractionMode, TransactionScope } from "./keyboard-intents";
import { SCOPE_PRIORITY } from "./keyboard-intents";

interface TransactionKeyboardProviderProps {
  children: React.ReactNode;
  onSave?: () => void;
  onRemoveLine?: (lineId: string) => void;
  onRemovePayment?: (paymentId: string) => void;
  onAbandonDraft?: () => void;
}

export function TransactionKeyboardProvider({
  children,
  onSave,
  onRemoveLine,
  onRemovePayment,
  onAbandonDraft,
}: TransactionKeyboardProviderProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Safety checks: ignore composing (IME) or already defaultPrevented events
      if (e.isComposing || e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      const isInput =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      const activeFieldId = focusRegistry.getActiveFieldId();
      const activeZoneId = focusRegistry.getActiveZoneId();
      const mode = focusRegistry.getMode();
      const activeField = activeFieldId ? focusRegistry.getField(activeFieldId) : undefined;

      // ─── Scope Priority Resolution ──────────────────────────────────────────
      let activeScope: TransactionScope = "GLOBAL";
      if (mode === "DIALOG") {
        activeScope = "DIALOG";
      } else if (mode === "COMBOBOX") {
        activeScope = "COMBOBOX";
      } else if (mode === "EDITING") {
        activeScope = "CELL_EDIT";
      } else if (activeZoneId === "LINE_ITEM_GRID" || activeZoneId === "PAYMENT_GRID") {
        activeScope = "GRID";
      } else if (activeZoneId.startsWith("SALE_") || activeZoneId.startsWith("CUSTOMER_")) {
        activeScope = "FORM";
      }

      // ─── DIALOG Scope ───────────────────────────────────────────────────────
      if (activeScope === "DIALOG") {
        if (e.key === "Escape") {
          e.preventDefault();
          focusRegistry.restorePreviousFocus();
          focusRegistry.setMode("NAVIGATION");
          return;
        }
        return; // Modal traps other keys natively
      }

      // ─── COMBOBOX Scope ─────────────────────────────────────────────────────
      if (activeScope === "COMBOBOX") {
        if (e.key === "Escape") {
          e.preventDefault();
          focusRegistry.setMode("NAVIGATION");
          return;
        }
        // Let ComboboxController handle Up/Down/Enter natively
        return;
      }

      // ─── CELL_EDIT Scope ────────────────────────────────────────────────────
      if (activeScope === "CELL_EDIT") {
        if (e.key === "Escape") {
          e.preventDefault();
          // Cancel cell edit and return to NAVIGATION mode
          focusRegistry.setMode("NAVIGATION");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          // Commit edit and advance to next cell
          focusRegistry.setMode("NAVIGATION");
          if (activeField && activeZoneId === "LINE_ITEM_GRID") {
            const fields = focusRegistry.getFieldsInZone("LINE_ITEM_GRID");
            const next = editableGridController.calculateNextField(fields, activeField, "RIGHT");
            if (next) {
              focusRegistry.setActiveField(next.id);
            }
          }
          return;
        }
        // Preserve native typing and Left/Right caret inside text input
        return;
      }

      // ─── GRID Scope (2D Roving Focus Navigation) ───────────────────────────
      if (activeScope === "GRID") {
        // Ctrl+D line removal
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
          e.preventDefault();
          if (activeField) {
            const parts = activeField.id.split(".");
            if (activeZoneId === "LINE_ITEM_GRID" && parts.length >= 3) {
              const lineId = parts[2];
              onRemoveLine?.(lineId);
            } else if (activeZoneId === "PAYMENT_GRID" && parts.length >= 3) {
              const paymentId = parts[2];
              onRemovePayment?.(paymentId);
            }
          }
          return;
        }

        // Arrow Key Navigation
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
          if (!activeField) return;

          let dir: "UP" | "DOWN" | "LEFT" | "RIGHT" | "HOME" | "END" | "CTRL_HOME" | "CTRL_END" | "PAGE_UP" | "PAGE_DOWN" | null = null;
          if (e.key === "ArrowUp") dir = "UP";
          if (e.key === "ArrowDown") dir = "DOWN";
          if (e.key === "ArrowLeft") dir = "LEFT";
          if (e.key === "ArrowRight") dir = "RIGHT";
          if (e.key === "Home") dir = e.ctrlKey || e.metaKey ? "CTRL_HOME" : "HOME";
          if (e.key === "End") dir = e.ctrlKey || e.metaKey ? "CTRL_END" : "END";
          if (e.key === "PageUp") dir = "PAGE_UP";
          if (e.key === "PageDown") dir = "PAGE_DOWN";

          if (dir) {
            e.preventDefault();
            const fields = focusRegistry.getFieldsInZone(activeZoneId);
            const next = editableGridController.calculateNextField(fields, activeField, dir);
            if (next) {
              focusRegistry.setActiveField(next.id);
            }
          }
          return;
        }

        // Enter into Edit Mode
        if (e.key === "Enter") {
          e.preventDefault();
          focusRegistry.setMode("EDITING");
          return;
        }

        // Printable Character starts Edit Mode immediately (replaces text)
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          focusRegistry.setMode("EDITING");
          return;
        }
      }

      // ─── FORM & GLOBAL Scope ────────────────────────────────────────────────
      // Ctrl+A / Cmd+A Save Sale (Browser-Safe)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        // If typing inside standard text input/textarea, preserve native Select All
        if (isInput && (target.tagName === "TEXTAREA" || target.getAttribute("type") === "text")) {
          return; // Allow native select-all
        }
        e.preventDefault();
        onSave?.();
        return;
      }

      // Ctrl+Enter Save Sale
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSave?.();
        return;
      }

      // F4 Focus Customer Search
      if (e.key === "F4") {
        e.preventDefault();
        focusRegistry.setActiveField("sale.customer.search", "CUSTOMER_SEARCH");
        return;
      }

      // Escape Hierarchy
      if (e.key === "Escape") {
        e.preventDefault();
        if (isInput) {
          target.blur();
          return;
        }
        onAbandonDraft?.();
        return;
      }
    },
    [onSave, onRemoveLine, onRemovePayment, onAbandonDraft]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return <>{children}</>;
}
