import { commandExecutor } from "@/lib/commands/command-executor";
import { contextKeyService } from "@/lib/context/context-key-service";
import { readContextFromTarget } from "@/lib/context/context-scope";
import { keyboardDiagnostics } from "./keyboard-diagnostics";
import { normalizeKeyboardEvent } from "./keyboard-normalizer";
import { resolveKeybinding } from "./keybinding-resolver";

const NATIVE_EDIT_CHORDS = new Set([
  "ctrl+a",
  "ctrl+c",
  "ctrl+v",
  "ctrl+x",
  "ctrl+y",
  "ctrl+z",
  "ctrl+shift+z",
  "meta+a",
  "meta+c",
  "meta+v",
  "meta+x",
  "meta+y",
  "meta+z",
  "meta+shift+z",
]);

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  return false;
}

function isEmptyEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return (target.textContent ?? "").length === 0;
  if (target instanceof HTMLTextAreaElement) return target.value.length === 0;
  if (target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(target.type)) return target.value.length === 0;
  return false;
}

export class KeyboardService {
  private listening = false;
  private readonly handler = (event: KeyboardEvent) => {
    void this.handle(event);
  };

  start(): () => void {
    if (typeof window === "undefined" || this.listening) return () => undefined;
    window.addEventListener("keydown", this.handler, { capture: true });
    this.listening = true;
    return () => {
      window.removeEventListener("keydown", this.handler, { capture: true });
      this.listening = false;
    };
  }

  async handle(event: KeyboardEvent): Promise<boolean> {
    if (event.defaultPrevented || event.isComposing) return false;

    const key = normalizeKeyboardEvent(event);
    if (!key) return false;

    const editable = isEditableTarget(event.target);
    if (editable && NATIVE_EDIT_CHORDS.has(key)) return false;

    const local = readContextFromTarget(event.target);
    const context = contextKeyService.snapshot({
      ...local,
      "input.editable": editable,
      "input.empty": isEmptyEditableTarget(event.target),
    });
    const resolution = resolveKeybinding(key, context);
    keyboardDiagnostics.record({ at: Date.now(), key, context, resolution });

    const binding = resolution.winner;
    if (!binding) return false;
    if (event.repeat && !binding.allowRepeat) return false;
    if (!commandExecutor.canExecute(binding.command, context)) return false;

    if (binding.preventDefault !== false) event.preventDefault();

    return commandExecutor.execute(binding.command, {
      source: "keyboard",
      key,
      event,
      target: event.target,
      context,
    });
  }
}

export const keyboardService = new KeyboardService();
