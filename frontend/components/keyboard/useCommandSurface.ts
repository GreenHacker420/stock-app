"use client";

import { useSyncExternalStore } from "react";

import { commandRegistry } from "@/lib/commands/command-registry";
import { getCommandSurfaceEntries, type CommandSurface } from "@/lib/commands/command-surfaces";
import { contextKeyService } from "@/lib/context/context-key-service";
import { focusContextService } from "@/lib/context/focus-context-service";
import { keybindingRegistry } from "@/lib/keyboard/keybinding-registry";

export function getActiveCommandContext() {
  return contextKeyService.snapshot(focusContextService.snapshot());
}

export function useCommandSurface(surface: CommandSurface) {
  useSyncExternalStore(contextKeyService.subscribe, contextKeyService.getVersion, contextKeyService.getServerVersion);
  useSyncExternalStore(focusContextService.subscribe, focusContextService.getVersion, focusContextService.getServerVersion);
  useSyncExternalStore(commandRegistry.subscribe, commandRegistry.getVersion, commandRegistry.getServerVersion);
  useSyncExternalStore(keybindingRegistry.subscribe, keybindingRegistry.getVersion, keybindingRegistry.getServerVersion);

  return getCommandSurfaceEntries(getActiveCommandContext(), surface);
}
