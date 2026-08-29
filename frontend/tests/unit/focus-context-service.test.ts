// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { FocusContextService } from "../../lib/context/focus-context-service";

function flushMutationObserver(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("FocusContextService", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("notifies subscribers when an active ancestor scope changes without focus moving", async () => {
    const service = new FocusContextService();
    const scope = document.createElement("div");
    const input = document.createElement("input");
    scope.setAttribute("data-keyboard-scope", JSON.stringify({ "combobox.open": false, "keyboard.scope": "combobox" }));
    scope.append(input);
    document.body.append(scope);
    input.focus();

    const stop = service.start();
    let notifications = 0;
    const unsubscribe = service.subscribe(() => {
      notifications += 1;
    });
    const initialVersion = service.getVersion();

    scope.setAttribute("data-keyboard-scope", JSON.stringify({ "combobox.open": true, "keyboard.scope": "combobox" }));
    await flushMutationObserver();

    expect(document.activeElement).toBe(input);
    expect(service.getVersion()).toBeGreaterThan(initialVersion);
    expect(notifications).toBeGreaterThan(0);
    expect(service.snapshot()).toMatchObject({
      "combobox.open": true,
      "keyboard.scope": "combobox",
    });

    unsubscribe();
    stop();
  });

  it("ignores scope mutations outside the active focus ancestry", async () => {
    const service = new FocusContextService();
    const activeScope = document.createElement("div");
    const input = document.createElement("input");
    activeScope.append(input);
    const unrelatedScope = document.createElement("div");
    document.body.append(activeScope, unrelatedScope);
    input.focus();

    const stop = service.start();
    const initialVersion = service.getVersion();

    unrelatedScope.setAttribute("data-keyboard-scope", JSON.stringify({ "dialog.open": true }));
    await flushMutationObserver();

    expect(service.getVersion()).toBe(initialVersion);

    stop();
  });
});
