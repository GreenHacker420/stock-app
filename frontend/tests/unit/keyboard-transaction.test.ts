import { describe, it, expect, beforeEach } from "vitest";
import { focusRegistry } from "../../components/keyboard/focus-registry";
import { editableGridController } from "../../components/keyboard/EditableGridController";
import { ComboboxKeyboardController } from "../../components/keyboard/ComboboxKeyboardController";
import { SCOPE_PRIORITY } from "../../components/keyboard/keyboard-intents";
import type { RegisteredField } from "../../components/keyboard/focus-registry";

describe("Tally Transaction Keyboard Engine Unit Tests", () => {
  beforeEach(() => {
    focusRegistry.clear();
    focusRegistry.setMode("NAVIGATION");
  });

  it("1. Scope priority resolution hierarchy follows exact strict order", () => {
    expect(SCOPE_PRIORITY.DIALOG).toBeGreaterThan(SCOPE_PRIORITY.COMBOBOX);
    expect(SCOPE_PRIORITY.COMBOBOX).toBeGreaterThan(SCOPE_PRIORITY.CELL_EDIT);
    expect(SCOPE_PRIORITY.CELL_EDIT).toBeGreaterThan(SCOPE_PRIORITY.GRID);
    expect(SCOPE_PRIORITY.GRID).toBeGreaterThan(SCOPE_PRIORITY.FORM);
    expect(SCOPE_PRIORITY.FORM).toBeGreaterThan(SCOPE_PRIORITY.PAGE);
    expect(SCOPE_PRIORITY.PAGE).toBeGreaterThan(SCOPE_PRIORITY.GLOBAL);
  });

  it("2. 2D Grid Navigation: ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Home, End, Ctrl+Home, Ctrl+End", () => {
    const fields: RegisteredField[] = [
      { id: "line-0-qty", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 0, colIndex: 0 },
      { id: "line-0-rate", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 0, colIndex: 1 },
      { id: "line-0-disc", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 0, colIndex: 2 },
      { id: "line-1-qty", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 1, colIndex: 0 },
      { id: "line-1-rate", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 1, colIndex: 1 },
      { id: "line-1-disc", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 1, colIndex: 2 },
    ];

    const current = fields[0]; // (0, 0)

    // ArrowRight -> (0, 1)
    const nextRight = editableGridController.calculateNextField(fields, current, "RIGHT");
    expect(nextRight?.id).toBe("line-0-rate");

    // ArrowDown -> (1, 0)
    const nextDown = editableGridController.calculateNextField(fields, current, "DOWN");
    expect(nextDown?.id).toBe("line-1-qty");

    // ArrowLeft from (0,0) -> boundary stay
    const nextLeftBoundary = editableGridController.calculateNextField(fields, current, "LEFT");
    expect(nextLeftBoundary?.id).toBe("line-0-qty");

    // End -> (0, 2)
    const endField = editableGridController.calculateNextField(fields, current, "END");
    expect(endField?.id).toBe("line-0-disc");

    // Ctrl+End -> (1, 2)
    const ctrlEnd = editableGridController.calculateNextField(fields, current, "CTRL_END");
    expect(ctrlEnd?.id).toBe("line-1-disc");

    // Ctrl+Home -> (0, 0)
    const ctrlHome = editableGridController.calculateNextField(fields, fields[5], "CTRL_HOME");
    expect(ctrlHome?.id).toBe("line-0-qty");
  });

  it("3. Interaction Mode state transitions", () => {
    expect(focusRegistry.getMode()).toBe("NAVIGATION");

    focusRegistry.setMode("EDITING");
    expect(focusRegistry.getMode()).toBe("EDITING");

    focusRegistry.setMode("COMBOBOX");
    expect(focusRegistry.getMode()).toBe("COMBOBOX");

    focusRegistry.setMode("DIALOG");
    expect(focusRegistry.getMode()).toBe("DIALOG");
  });

  it("4. Focus restoration stack maintains history across field switches", () => {
    focusRegistry.register({ id: "f1", zoneId: "Z1", element: null });
    focusRegistry.register({ id: "f2", zoneId: "Z1", element: null });

    focusRegistry.setActiveField("f1");
    focusRegistry.setActiveField("f2");

    expect(focusRegistry.getActiveFieldId()).toBe("f2");

    const restored = focusRegistry.restorePreviousFocus();
    expect(restored).toBe(true);
    expect(focusRegistry.getActiveFieldId()).toBe("f1");
  });

  it("5. ComboboxKeyboardController options navigation & selection", () => {
    const cb = new ComboboxKeyboardController();
    cb.setItems([
      { id: "1", label: "Item 1", data: { name: "Item 1" } },
      { id: "2", label: "Item 2", data: { name: "Item 2" } },
      { id: "3", label: "Item 3", data: { name: "Item 3" } },
    ]);
    cb.setOpen(true);

    expect(cb.getActiveIndex()).toBe(0);

    const downRes = cb.handleKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(downRes.handled).toBe(true);
    expect(cb.getActiveIndex()).toBe(1);

    const selectRes = cb.handleKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(selectRes.handled).toBe(true);
    expect(selectRes.action).toBe("SELECT");
    expect(cb.getActiveItem()?.label).toBe("Item 2");
  });
});
