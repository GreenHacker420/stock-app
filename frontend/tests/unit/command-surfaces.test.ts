import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { commandRegistry } from "../../lib/commands/command-registry";
import { getCommandSurfaceEntries } from "../../lib/commands/command-surfaces";
import { keybindingRegistry } from "../../lib/keyboard/keybinding-registry";

describe("command surfaces", () => {
  beforeEach(() => {
    commandRegistry.clear();
    keybindingRegistry.clear();
  });

  afterEach(() => {
    commandRegistry.clear();
    keybindingRegistry.clear();
  });

  it("hides a bound command from the palette when none of its bindings apply", () => {
    commandRegistry.register({
      id: "report.open",
      title: "Open report row",
      execute: () => undefined,
    });
    keybindingRegistry.register({
      id: "report-open-enter",
      key: "enter",
      command: "report.open",
      when: "report.focused && report.id == sales.register",
      priority: 50,
    });

    expect(getCommandSurfaceEntries({
      "report.focused": false,
      "report.id": "sales.register",
    }, "palette")).toEqual([]);
  });

  it("shows a bound command when its contextual binding applies", () => {
    commandRegistry.register({
      id: "report.open",
      title: "Open report row",
      execute: () => undefined,
    });
    keybindingRegistry.register({
      id: "report-open-enter",
      key: "enter",
      command: "report.open",
      when: "report.focused && report.id == sales.register",
      priority: 50,
    });

    const entries = getCommandSurfaceEntries({
      "report.focused": true,
      "report.id": "sales.register",
    }, "palette");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("report.open");
    expect(entries[0]?.key).toBe("enter");
  });

  it("keeps genuinely unbound palette commands visible", () => {
    commandRegistry.register({
      id: "help.open",
      title: "Open help",
      category: "Help",
      execute: () => undefined,
    });

    const entries = getCommandSurfaceEntries({}, "palette");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("help.open");
    expect(entries[0]?.key).toBeUndefined();
  });

  it("projects the palette overlay out before testing a global binding", () => {
    commandRegistry.register({
      id: "navigation.create",
      title: "Create transaction",
      execute: () => undefined,
    });
    keybindingRegistry.register({
      id: "navigation-create-f8",
      key: "f8",
      command: "navigation.create",
      when: "!dialog.open",
      priority: 20,
    });

    const entries = getCommandSurfaceEntries({
      "dialog.open": true,
      "dialog.commandPalette": true,
      "input.editable": true,
    }, "palette");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("navigation.create");
    expect(entries[0]?.key).toBe("f8");
  });
});
