"use client";

import { useEffect, type ReactNode } from "react";

import { commandRegistry } from "@/lib/commands/command-registry";
import type { CommandDefinition } from "@/lib/commands/command-types";
import { focusContextService } from "@/lib/context/focus-context-service";
import { keybindingRegistry } from "@/lib/keyboard/keybinding-registry";
import { keyboardService } from "@/lib/keyboard/keyboard-service";
import type { KeybindingRule } from "@/lib/keyboard/keyboard-types";

export function KeyboardRuntimeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const stopKeyboard = keyboardService.start();
    const stopFocusContext = focusContextService.start();
    return () => {
      stopFocusContext();
      stopKeyboard();
    };
  }, []);

  return children;
}

export function useCommand(command: CommandDefinition): void {
  useEffect(() => commandRegistry.register(command), [command]);
}

export function useKeybinding(binding: KeybindingRule): void {
  useEffect(() => keybindingRegistry.register(binding), [binding]);
}
