// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { editableGridController } from "../../components/keyboard/EditableGridController";
import { focusRegistry } from "../../components/keyboard/focus-registry";
import type { RegisteredField } from "../../components/keyboard/focus-registry";
import { compileContextExpression } from "../../lib/context/context-expression";

beforeEach(() => {
  focusRegistry.clear();
});

describe("transaction keyboard primitives", () => {
  it("uses context expressions instead of fixed scope priority constants", () => {
    const grid = compileContextExpression(
      "transaction.active && transaction.grid && transaction.mode == NAVIGATION && !dialog.open",
    );
    expect(grid({
      "transaction.active": true,
      "transaction.grid": true,
      "transaction.mode": "NAVIGATION",
      "dialog.open": false,
    })).toBe(true);
    expect(grid({
      "transaction.active": true,
      "transaction.grid": true,
      "transaction.mode": "EDITING",
      "dialog.open": false,
    })).toBe(false);
  });

  it("navigates the editable grid in two dimensions", () => {
    const fields: RegisteredField[] = [
      { id: "line-0-qty", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 0, colIndex: 0 },
      { id: "line-0-rate", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 0, colIndex: 1 },
      { id: "line-0-disc", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 0, colIndex: 2 },
      { id: "line-1-qty", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 1, colIndex: 0 },
      { id: "line-1-rate", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 1, colIndex: 1 },
      { id: "line-1-disc", zoneId: "LINE_ITEM_GRID", element: null, rowIndex: 1, colIndex: 2 },
    ];

    const current = fields[0];
    expect(editableGridController.calculateNextField(fields, current, "RIGHT")?.id).toBe("line-0-rate");
    expect(editableGridController.calculateNextField(fields, current, "DOWN")?.id).toBe("line-1-qty");
    expect(editableGridController.calculateNextField(fields, current, "LEFT")?.id).toBe("line-0-qty");
    expect(editableGridController.calculateNextField(fields, current, "END")?.id).toBe("line-0-disc");
    expect(editableGridController.calculateNextField(fields, current, "CTRL_END")?.id).toBe("line-1-disc");
    expect(editableGridController.calculateNextField(fields, fields[5], "CTRL_HOME")?.id).toBe("line-0-qty");
  });

  it("orders only mounted enabled voucher fields", () => {
    const later = document.createElement("input");
    const earlier = document.createElement("input");
    const disabled = document.createElement("input");

    focusRegistry.register({ id: "later", zoneId: "SALE_HEADER", element: later, order: 20 });
    focusRegistry.register({ id: "earlier", zoneId: "SALE_HEADER", element: earlier, order: 10 });
    focusRegistry.register({ id: "disabled", zoneId: "SALE_HEADER", element: disabled, order: 5, disabled: true });
    focusRegistry.register({ id: "unmounted", zoneId: "SALE_HEADER", element: null, order: 1 });
    focusRegistry.register({ id: "grid-only", zoneId: "LINE_ITEM_GRID", element: document.createElement("input") });

    expect(focusRegistry.getOrderedFields().map((field) => field.id)).toEqual(["earlier", "later"]);
  });

  it("tracks interaction mode transitions", () => {
    expect(focusRegistry.getMode()).toBe("NAVIGATION");
    focusRegistry.setMode("EDITING");
    expect(focusRegistry.getMode()).toBe("EDITING");
    focusRegistry.setMode("COMBOBOX");
    expect(focusRegistry.getMode()).toBe("COMBOBOX");
    focusRegistry.setMode("DIALOG");
    expect(focusRegistry.getMode()).toBe("DIALOG");
  });

  it("restores previous registered focus", () => {
    focusRegistry.register({ id: "f1", zoneId: "Z1", element: null });
    focusRegistry.register({ id: "f2", zoneId: "Z1", element: null });
    focusRegistry.setActiveField("f1");
    focusRegistry.setActiveField("f2");
    expect(focusRegistry.restorePreviousFocus()).toBe(true);
    expect(focusRegistry.getActiveFieldId()).toBe("f1");
  });
});
