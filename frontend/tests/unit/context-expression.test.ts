import { describe, expect, it } from "vitest";

import { compileContextExpression } from "../../lib/context/context-expression";

describe("context expression parser", () => {
  it("respects AND precedence over OR", () => {
    const predicate = compileContextExpression("a || b && c");

    expect(predicate({ a: false, b: true, c: false })).toBe(false);
    expect(predicate({ a: false, b: true, c: true })).toBe(true);
    expect(predicate({ a: true, b: false, c: false })).toBe(true);
  });

  it("supports grouping with parentheses", () => {
    const predicate = compileContextExpression("(a || b) && c");

    expect(predicate({ a: true, b: false, c: false })).toBe(false);
    expect(predicate({ a: false, b: true, c: true })).toBe(true);
  });

  it("supports nested negation", () => {
    const predicate = compileContextExpression("!(dialog.open || input.editable) && app.authenticated");

    expect(predicate({ "dialog.open": false, "input.editable": false, "app.authenticated": true })).toBe(true);
    expect(predicate({ "dialog.open": true, "input.editable": false, "app.authenticated": true })).toBe(false);
  });

  it("compares typed literals and unquoted enum-like strings", () => {
    const predicate = compileContextExpression(
      "count == 2 && enabled == true && optional == null && missing == undefined && transaction.mode == NAVIGATION",
    );

    expect(predicate({
      count: 2,
      enabled: true,
      optional: null,
      "transaction.mode": "NAVIGATION",
    })).toBe(true);

    expect(predicate({
      count: 3,
      enabled: true,
      optional: null,
      "transaction.mode": "NAVIGATION",
    })).toBe(false);
  });

  it("supports quoted literals containing spaces and operators", () => {
    const predicate = compileContextExpression("label == 'Sales && Returns' && route != \"/login || /auth\"");

    expect(predicate({ label: "Sales && Returns", route: "/sales" })).toBe(true);
    expect(predicate({ label: "Sales && Returns", route: "/login || /auth" })).toBe(false);
  });

  it("caches compiled expressions", () => {
    const first = compileContextExpression("report.focused && !dialog.open");
    const second = compileContextExpression("report.focused && !dialog.open");

    expect(second).toBe(first);
  });

  it("rejects malformed expressions instead of silently accepting them", () => {
    expect(() => compileContextExpression("(report.focused || dialog.open")).toThrow(SyntaxError);
    expect(() => compileContextExpression("report.focused && && dialog.open")).toThrow(SyntaxError);
    expect(() => compileContextExpression("transaction.mode ==")).toThrow(SyntaxError);
    expect(() => compileContextExpression("label == 'unterminated")).toThrow(SyntaxError);
  });
});
