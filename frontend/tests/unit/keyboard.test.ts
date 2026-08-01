// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { ShortcutEngine } from "../../lib/keyboard/shortcut-engine";

describe("ShortcutEngine (Priority & Input Safety)", () => {
  let engine: ShortcutEngine;

  beforeEach(() => {
    engine = new ShortcutEngine();
  });

  it("prioritizes DIALOG over FORM over GLOBAL scope", () => {
    let triggeredScope = "";

    engine.register({
      id: "global-esc",
      key: "esc",
      scope: "GLOBAL",
      description: "Global Escape",
      action: () => {
        triggeredScope = "GLOBAL";
      },
    });

    engine.register({
      id: "dialog-esc",
      key: "esc",
      scope: "DIALOG",
      description: "Dialog Escape",
      action: () => {
        triggeredScope = "DIALOG";
      },
    });

    engine.register({
      id: "form-esc",
      key: "esc",
      scope: "FORM",
      description: "Form Escape",
      action: () => {
        triggeredScope = "FORM";
      },
    });

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    engine.handleKeyDown(event);

    expect(triggeredScope).toBe("DIALOG");
  });

  it("prevents duplicate registration with the same ID", () => {
    engine.register({
      id: "action-f8",
      key: "f8",
      scope: "GLOBAL",
      description: "Action 1",
      action: () => {},
    });

    engine.register({
      id: "action-f8",
      key: "f8",
      scope: "GLOBAL",
      description: "Action 2",
      action: () => {},
    });

    expect(engine.getShortcuts().length).toBe(1);
    expect(engine.getShortcuts()[0].description).toBe("Action 2");
  });

  it("ignores disabled registrations", () => {
    let executed = false;
    engine.register({
      id: "disabled-shortcut",
      key: "f8",
      scope: "GLOBAL",
      description: "Disabled Action",
      disabled: true,
      action: () => {
        executed = true;
      },
    });

    const event = new KeyboardEvent("keydown", { key: "F8" });
    const handled = engine.handleKeyDown(event);

    expect(handled).toBe(false);
    expect(executed).toBe(false);
  });

  it("prevents navigation shortcuts while typing inside text input", () => {
    let executed = false;
    engine.register({
      id: "new-sale-f8",
      key: "f8",
      scope: "GLOBAL",
      description: "New Sale",
      action: () => {
        executed = true;
      },
    });

    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { key: "F8", bubbles: true });
    Object.defineProperty(event, "target", { value: input, enumerable: true });

    engine.handleKeyDown(event);
    expect(executed).toBe(false);
  });

  it("allows Escape inside text input to dismiss top interactive layer", () => {
    let executed = false;
    engine.register({
      id: "dialog-close",
      key: "esc",
      scope: "DIALOG",
      description: "Dismiss Dialog",
      preventInInput: false,
      action: () => {
        executed = true;
      },
    });

    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(event, "target", { value: input, enumerable: true });

    engine.handleKeyDown(event);
    expect(executed).toBe(true);
  });
});
