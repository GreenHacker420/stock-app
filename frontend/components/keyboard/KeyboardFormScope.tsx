"use client";

import { useCallback, useMemo, type ReactNode } from "react";

import { useCommand, useKeybinding } from "./KeyboardRuntimeProvider";

function getFocusableFields(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-kernel-field]"))
    .filter((field) => !field.hasAttribute("disabled") && field.getAttribute("aria-disabled") !== "true" && field.offsetParent !== null);
}

function focusRelative(target: EventTarget | null, delta: number): void {
  if (!(target instanceof HTMLElement)) return;
  const root = target.closest<HTMLElement>("[data-kernel-form]");
  if (!root) return;
  const fields = getFocusableFields(root);
  if (fields.length === 0) return;
  const current = fields.indexOf(target);
  const nextIndex = current < 0
    ? (delta > 0 ? 0 : fields.length - 1)
    : Math.max(0, Math.min(fields.length - 1, current + delta));
  const next = fields[nextIndex];
  next?.focus();
  if (next instanceof HTMLInputElement && next.type !== "date") next.select();
}

export function KeyboardFormScope({
  id,
  children,
  onSubmit,
  disabled = false,
}: {
  id: string;
  children: ReactNode;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const moveNext = useCallback(({ target }: { target?: EventTarget | null }) => focusRelative(target ?? null, 1), []);
  const movePrevious = useCallback(({ target }: { target?: EventTarget | null }) => focusRelative(target ?? null, -1), []);

  const commands = useMemo(() => ({
    next: {
      id: `form.${id}.next`,
      title: "Next field",
      category: "Form",
      when: `form.id == ${id} && !form.disabled && input.editable && !form.multiline && !combobox.open && !dialog.open`,
      execute: moveNext,
    },
    previous: {
      id: `form.${id}.previous`,
      title: "Previous field",
      category: "Form",
      when: `form.id == ${id} && !form.disabled && input.editable && !form.multiline && !combobox.open && !dialog.open`,
      execute: movePrevious,
    },
    submit: {
      id: `form.${id}.submit`,
      title: "Save",
      category: "Form",
      when: `form.id == ${id} && !form.disabled && !dialog.open`,
      execute: onSubmit,
    },
  }), [id, moveNext, movePrevious, onSubmit]);

  useCommand(commands.next);
  useCommand(commands.previous);
  useCommand(commands.submit);
  useKeybinding(useMemo(() => ({ id: `form-${id}-next`, key: "enter", command: commands.next.id, when: commands.next.when, priority: 120 }), [commands.next.id, commands.next.when, id]));
  useKeybinding(useMemo(() => ({ id: `form-${id}-previous`, key: "shift+enter", command: commands.previous.id, when: commands.previous.when, priority: 120 }), [commands.previous.id, commands.previous.when, id]));
  useKeybinding(useMemo(() => ({ id: `form-${id}-submit`, key: "ctrl+enter", command: commands.submit.id, when: commands.submit.when, priority: 140 }), [commands.submit.id, commands.submit.when, id]));

  const scope = useMemo(() => JSON.stringify({
    "form.id": id,
    "form.disabled": disabled,
    "keyboard.scope": "form",
  }), [disabled, id]);

  return <div data-kernel-form={id} data-keyboard-scope={scope}>{children}</div>;
}

export const MULTILINE_FORM_SCOPE = JSON.stringify({ "form.multiline": true });
