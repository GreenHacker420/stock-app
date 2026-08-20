"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";

import { contextKeyService } from "@/lib/context/context-key-service";
import { editableGridController } from "./EditableGridController";
import type { GridDirection } from "./EditableGridController";
import { focusRegistry } from "./focus-registry";
import { useCommand, useKeybinding } from "./KeyboardRuntimeProvider";
import { useTransactionFocus } from "./TransactionFocusContext";

interface TransactionKeyboardProviderProps {
  children: ReactNode;
  onSave?: () => void;
  onRemoveLine?: (lineId: string) => void;
  onRemovePayment?: (paymentId: string) => void;
  onAbandonDraft?: () => void;
  mutationPending?: boolean;
}

function isEditableElement(target: EventTarget | null | undefined): target is HTMLElement {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function orderedGridFields(zoneId: string) {
  return focusRegistry.getFieldsInZone(zoneId).sort((left, right) => {
    const rowDifference = (left.rowIndex ?? 0) - (right.rowIndex ?? 0);
    if (rowDifference !== 0) return rowDifference;
    return (left.colIndex ?? 0) - (right.colIndex ?? 0);
  });
}

export function TransactionKeyboardProvider({
  children,
  onSave,
  onRemoveLine,
  onRemovePayment,
  onAbandonDraft,
  mutationPending = false,
}: TransactionKeyboardProviderProps) {
  const { activeFieldId, activeZoneId, mode } = useTransactionFocus();
  const lineGrid = activeZoneId === "LINE_ITEM_GRID";
  const paymentGrid = activeZoneId === "PAYMENT_GRID";
  const grid = lineGrid || paymentGrid;
  const activeField = activeFieldId ? focusRegistry.getField(activeFieldId) : undefined;
  const formField = !grid && activeField?.order !== undefined;

  useEffect(() => {
    if (!activeFieldId || !focusRegistry.getField(activeFieldId)) {
      const frame = requestAnimationFrame(() => {
        const fields = focusRegistry.getOrderedFields();
        if (fields.length > 0 && fields[0].element) {
          focusRegistry.setActiveField(fields[0].id, fields[0].zoneId);
        } else {
          const gridFields = orderedGridFields("LINE_ITEM_GRID");
          if (gridFields.length > 0 && gridFields[0].element) {
            focusRegistry.setActiveField(gridFields[0].id, gridFields[0].zoneId);
          }
        }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [activeFieldId]);

  useEffect(() => {
    contextKeyService.patch({
      "app.module": "sales",
      "app.view": "sales.new",
      "transaction.active": true,
      "transaction.activeFieldId": activeFieldId,
      "transaction.zone": activeZoneId,
      "transaction.mode": mode,
      "transaction.grid": grid,
      "transaction.formField": formField,
      "transaction.lineGrid": lineGrid,
      "transaction.paymentGrid": paymentGrid,
      "transaction.editing": mode === "EDITING",
      "transaction.combobox": mode === "COMBOBOX",
      "transaction.dialog": mode === "DIALOG",
      "form.focused": true,
      "mutation.pending": mutationPending,
    });

    return () => {
      contextKeyService.patch({
        "app.module": undefined,
        "app.view": undefined,
        "transaction.active": undefined,
        "transaction.activeFieldId": undefined,
        "transaction.zone": undefined,
        "transaction.mode": undefined,
        "transaction.grid": undefined,
        "transaction.formField": undefined,
        "transaction.lineGrid": undefined,
        "transaction.paymentGrid": undefined,
        "transaction.editing": undefined,
        "transaction.combobox": undefined,
        "transaction.dialog": undefined,
        "form.focused": undefined,
        "mutation.pending": undefined,
      });
    };
  }, [activeFieldId, activeZoneId, formField, grid, lineGrid, mode, mutationPending, paymentGrid]);

  const moveField = useCallback((direction: GridDirection) => {
    const fieldId = focusRegistry.getActiveFieldId();
    const zoneId = focusRegistry.getActiveZoneId();
    const field = fieldId ? focusRegistry.getField(fieldId) : undefined;
    if (!field) return;
    const fields = focusRegistry.getFieldsInZone(zoneId);
    const next = editableGridController.calculateNextField(fields, field, direction);
    if (next) focusRegistry.setActiveField(next.id);
  }, []);

  const advanceFormField = useCallback(() => {
    const fieldId = focusRegistry.getActiveFieldId();
    if (!fieldId) return;
    const fields = focusRegistry.getOrderedFields();
    const currentIndex = fields.findIndex((field) => field.id === fieldId);
    if (currentIndex < 0) return;

    const next = fields[currentIndex + 1];
    if (next) {
      focusRegistry.setActiveField(next.id, next.zoneId);
      return;
    }

    const firstGridField = orderedGridFields("LINE_ITEM_GRID")[0];
    if (firstGridField) focusRegistry.setActiveField(firstGridField.id, firstGridField.zoneId);
  }, []);

  const retreatFormField = useCallback(() => {
    const fieldId = focusRegistry.getActiveFieldId();
    if (!fieldId) return;
    const fields = focusRegistry.getOrderedFields();
    const currentIndex = fields.findIndex((field) => field.id === fieldId);
    if (currentIndex <= 0) return;
    const previous = fields[currentIndex - 1];
    focusRegistry.setActiveField(previous.id, previous.zoneId);
  }, []);

  const moveRemarksToSave = useCallback(() => {
    focusRegistry.setMode("NAVIGATION");
    focusRegistry.setActiveField("sale.save", "SAVE_BUTTON");
  }, []);

  const removeActive = useCallback(() => {
    const fieldId = focusRegistry.getActiveFieldId();
    const zoneId = focusRegistry.getActiveZoneId();
    if (!fieldId) return;
    const parts = fieldId.split(".");
    if (parts.length < 3) return;
    const entityId = parts[2];
    if (zoneId === "LINE_ITEM_GRID") onRemoveLine?.(entityId);
    if (zoneId === "PAYMENT_GRID") onRemovePayment?.(entityId);
  }, [onRemoveLine, onRemovePayment]);

  const commands = useMemo(() => ({
    save: { id: "sale.accept", title: "Accept Sale", category: "Sale Entry", execute: () => onSave?.() },
    customer: {
      id: "sale.customer.focus",
      title: "Customer",
      category: "Sale Entry",
      execute: () => {
        if (focusRegistry.getField("sale.customer.search")) {
          focusRegistry.setActiveField("sale.customer.search", "CUSTOMER_SEARCH");
        } else if (focusRegistry.getField("sale.customer.selected")) {
          focusRegistry.setActiveField("sale.customer.selected", "CUSTOMER_SEARCH");
        }
      },
    },
    advance: { id: "sale.form.advance", title: "Next Field", category: "Sale Entry", execute: advanceFormField },
    previous: { id: "sale.form.previous", title: "Previous Field", category: "Sale Entry", execute: retreatFormField },
    remarksNext: { id: "sale.remarks.next", title: "Accept Remarks", category: "Sale Entry", execute: moveRemarksToSave },
    remove: { id: "sale.grid.removeActive", title: "Remove Active Row", category: "Sale Entry", execute: removeActive },
    up: { id: "sale.grid.up", title: "Previous Row", category: "Sale Entry", repeatable: true, execute: () => moveField("UP") },
    down: { id: "sale.grid.down", title: "Next Row", category: "Sale Entry", repeatable: true, execute: () => moveField("DOWN") },
    left: { id: "sale.grid.left", title: "Previous Field", category: "Sale Entry", repeatable: true, execute: () => moveField("LEFT") },
    right: { id: "sale.grid.right", title: "Next Field", category: "Sale Entry", repeatable: true, execute: () => moveField("RIGHT") },
    home: { id: "sale.grid.home", title: "First Field", category: "Sale Entry", repeatable: true, execute: () => moveField("HOME") },
    end: { id: "sale.grid.end", title: "Last Field", category: "Sale Entry", repeatable: true, execute: () => moveField("END") },
    first: { id: "sale.grid.first", title: "First Grid Cell", category: "Sale Entry", repeatable: true, execute: () => moveField("CTRL_HOME") },
    last: { id: "sale.grid.last", title: "Last Grid Cell", category: "Sale Entry", repeatable: true, execute: () => moveField("CTRL_END") },
    pageUp: { id: "sale.grid.pageUp", title: "Previous Grid Block", category: "Sale Entry", repeatable: true, execute: () => moveField("PAGE_UP") },
    pageDown: { id: "sale.grid.pageDown", title: "Next Grid Block", category: "Sale Entry", repeatable: true, execute: () => moveField("PAGE_DOWN") },
    advanceCell: {
      id: "sale.grid.advanceCell",
      title: "Next Cell",
      category: "Sale Entry",
      execute: () => {
        const activeId = focusRegistry.getActiveFieldId();
        const element = activeId ? focusRegistry.getField(activeId)?.element : null;
        if (element instanceof HTMLButtonElement) {
          element.click();
          return;
        }
        moveField("RIGHT");
      },
    },
    cancelEdit: { id: "sale.grid.cancelEdit", title: "Revert Cell", category: "Sale Entry", execute: () => focusRegistry.setMode("NAVIGATION") },
    commitEdit: {
      id: "sale.grid.commitEdit",
      title: "Accept Cell",
      category: "Sale Entry",
      execute: () => {
        const fieldId = focusRegistry.getActiveFieldId();
        const zoneId = focusRegistry.getActiveZoneId();
        const field = fieldId ? focusRegistry.getField(fieldId) : undefined;
        focusRegistry.setMode("NAVIGATION");
        if (!field || (zoneId !== "LINE_ITEM_GRID" && zoneId !== "PAYMENT_GRID")) return;
        const fields = focusRegistry.getFieldsInZone(zoneId);
        const next = editableGridController.calculateNextField(fields, field, "RIGHT");
        if (next) focusRegistry.setActiveField(next.id);
      },
    },
    commitPreviousEdit: {
      id: "sale.grid.commitPreviousEdit",
      title: "Previous Cell",
      category: "Sale Entry",
      execute: () => {
        const fieldId = focusRegistry.getActiveFieldId();
        const zoneId = focusRegistry.getActiveZoneId();
        const field = fieldId ? focusRegistry.getField(fieldId) : undefined;
        focusRegistry.setMode("NAVIGATION");
        if (!field || (zoneId !== "LINE_ITEM_GRID" && zoneId !== "PAYMENT_GRID")) return;
        const fields = focusRegistry.getFieldsInZone(zoneId);
        const previous = editableGridController.calculateNextField(fields, field, "LEFT");
        if (previous) focusRegistry.setActiveField(previous.id);
      },
    },
    escape: {
      id: "sale.escape",
      title: "Back",
      category: "Sale Entry",
      execute: ({ target }: { target?: EventTarget | null }) => {
        if (isEditableElement(target)) {
          target.blur();
          return;
        }
        onAbandonDraft?.();
      },
    },
  }), [advanceFormField, moveField, moveRemarksToSave, onAbandonDraft, onSave, removeActive, retreatFormField]);

  useCommand(commands.save);
  useCommand(commands.customer);
  useCommand(commands.advance);
  useCommand(commands.previous);
  useCommand(commands.remarksNext);
  useCommand(commands.remove);
  useCommand(commands.up);
  useCommand(commands.down);
  useCommand(commands.left);
  useCommand(commands.right);
  useCommand(commands.home);
  useCommand(commands.end);
  useCommand(commands.first);
  useCommand(commands.last);
  useCommand(commands.pageUp);
  useCommand(commands.pageDown);
  useCommand(commands.advanceCell);
  useCommand(commands.cancelEdit);
  useCommand(commands.commitEdit);
  useCommand(commands.commitPreviousEdit);
  useCommand(commands.escape);

  const gridWhen = "transaction.active && transaction.grid && transaction.mode == NAVIGATION && !dialog.open && !combobox.open";
  const formAdvanceWhen = "transaction.active && transaction.formField && transaction.mode == NAVIGATION && !dialog.open && !combobox.open";
  const remarksWhen = "transaction.active && transaction.zone == REMARKS && transaction.mode == NAVIGATION && !dialog.open && !combobox.open";

  useKeybinding(useMemo(() => ({ id: "sale-form-advance", key: "enter", command: commands.advance.id, when: formAdvanceWhen, priority: 70 }), [commands.advance.id]));
  useKeybinding(useMemo(() => ({ id: "sale-form-previous", key: "shift+enter", command: commands.previous.id, when: formAdvanceWhen, priority: 80 }), [commands.previous.id]));
  useKeybinding(useMemo(() => ({ id: "sale-form-backspace-empty", key: "backspace", command: commands.previous.id, when: `${formAdvanceWhen} && input.empty`, priority: 85 }), [commands.previous.id]));
  useKeybinding(useMemo(() => ({ id: "sale-form-backspace-control", key: "backspace", command: commands.previous.id, when: `${formAdvanceWhen} && !input.editable`, priority: 85 }), [commands.previous.id]));
  useKeybinding(useMemo(() => ({ id: "sale-remarks-next", key: "enter", command: commands.remarksNext.id, when: remarksWhen, priority: 90 }), [commands.remarksNext.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-up", key: "arrowup", command: commands.up.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.up.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-down", key: "arrowdown", command: commands.down.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.down.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-left", key: "arrowleft", command: commands.left.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.left.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-right", key: "arrowright", command: commands.right.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.right.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-home", key: "home", command: commands.home.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.home.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-end", key: "end", command: commands.end.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.end.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-first", key: "ctrl+home", command: commands.first.id, when: gridWhen, priority: 130, allowRepeat: true }), [commands.first.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-last", key: "ctrl+end", command: commands.last.id, when: gridWhen, priority: 130, allowRepeat: true }), [commands.last.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-page-up", key: "pageup", command: commands.pageUp.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.pageUp.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-page-down", key: "pagedown", command: commands.pageDown.id, when: gridWhen, priority: 120, allowRepeat: true }), [commands.pageDown.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-remove", key: "ctrl+d", command: commands.remove.id, when: `${gridWhen} && !mutation.pending`, priority: 140 }), [commands.remove.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-advance", key: "enter", command: commands.advanceCell.id, when: gridWhen, priority: 120 }), [commands.advanceCell.id]));
  useKeybinding(useMemo(() => ({ id: "sale-grid-previous", key: "shift+enter", command: commands.left.id, when: gridWhen, priority: 130 }), [commands.left.id]));
  useKeybinding(useMemo(() => ({ id: "sale-edit-accept", key: "enter", command: commands.commitEdit.id, when: "transaction.active && transaction.mode == EDITING && !dialog.open", priority: 180 }), [commands.commitEdit.id]));
  useKeybinding(useMemo(() => ({ id: "sale-edit-previous", key: "shift+enter", command: commands.commitPreviousEdit.id, when: "transaction.active && transaction.mode == EDITING && !dialog.open", priority: 190 }), [commands.commitPreviousEdit.id]));
  useKeybinding(useMemo(() => ({ id: "sale-edit-cancel", key: "esc", command: commands.cancelEdit.id, when: "transaction.active && transaction.mode == EDITING && !dialog.open", priority: 180 }), [commands.cancelEdit.id]));
  useKeybinding(useMemo(() => ({ id: "sale-customer-f4", key: "f4", command: commands.customer.id, when: "transaction.active && !dialog.open && !mutation.pending", priority: 100 }), [commands.customer.id]));
  useKeybinding(useMemo(() => ({ id: "sale-save", key: "ctrl+a", command: commands.save.id, when: "transaction.active && !dialog.open && !mutation.pending", priority: 90 }), [commands.save.id]));
  useKeybinding(useMemo(() => ({ id: "sale-save-enter", key: "ctrl+enter", command: commands.save.id, when: "transaction.active && !dialog.open && !mutation.pending", priority: 90 }), [commands.save.id]));
  useKeybinding(useMemo(() => ({ id: "sale-escape", key: "esc", command: commands.escape.id, when: "transaction.active && transaction.mode == NAVIGATION && !dialog.open && !combobox.open", priority: 80 }), [commands.escape.id]));

  return <>{children}</>;
}
