// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { CommandRegistry } from "../../lib/commands/command-registry";
import { ContextKeyService } from "../../lib/context/context-key-service";
import { compileContextExpression } from "../../lib/context/context-expression";
import { KeybindingRegistry } from "../../lib/keyboard/keybinding-registry";

beforeEach(() => { /* singleton-free contract tests */ });

describe("context expressions", () => {
  it("evaluates booleans, equality and negation", () => {
    const predicate = compileContextExpression("report.focused && !dialog.open && app.view == sales.register");
    expect(predicate({ "report.focused": true, "dialog.open": false, "app.view": "sales.register" })).toBe(true);
    expect(predicate({ "report.focused": true, "dialog.open": true, "app.view": "sales.register" })).toBe(false);
  });
});

describe("external stores", () => {
  it("patches context atomically", () => {
    const service = new ContextKeyService();
    service.patch({ "app.view": "sales.register", "report.focused": true });
    expect(service.snapshot()).toMatchObject({ "app.view": "sales.register", "report.focused": true });
  });

  it("indexes bindings by normalized key", () => {
    const registry = new KeybindingRegistry();
    registry.register({ id: "sales-open", key: "Enter", command: "report.drillDown", when: "report.focused" });
    expect(registry.getCandidates("enter")).toHaveLength(1);
    expect(registry.getCandidates("f2")).toHaveLength(0);
  });

  it("rejects duplicate command ids", () => {
    const registry = new CommandRegistry();
    registry.register({ id: "x", title: "X", execute: () => undefined });
    expect(() => registry.register({ id: "x", title: "X2", execute: () => undefined })).toThrow();
  });
});
