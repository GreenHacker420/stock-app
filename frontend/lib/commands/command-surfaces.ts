import { compileContextExpression } from "@/lib/context/context-expression";
import type { ContextSnapshot } from "@/lib/context/context-types";
import { keybindingRegistry } from "@/lib/keyboard/keybinding-registry";
import type { CompiledKeybinding } from "@/lib/keyboard/keyboard-types";
import { commandRegistry } from "./command-registry";
import type { CommandDefinition } from "./command-types";

export type CommandSurface = "rail" | "status" | "palette";

export interface CommandSurfaceEntry {
  id: string;
  title: string;
  description?: string;
  category?: string;
  key?: string;
  priority: number;
  command: CommandDefinition;
  binding?: CompiledKeybinding;
}

const RAIL_NAVIGATION_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "home",
  "end",
  "pageup",
  "pagedown",
  "enter",
  "space",
  "esc",
]);

export function contextForCommandSurface(context: ContextSnapshot, surface: CommandSurface): ContextSnapshot {
  if (surface !== "palette" || context["dialog.commandPalette"] !== true) return context;
  return Object.freeze({
    ...context,
    "dialog.open": false,
    "dialog.commandPalette": false,
    "input.editable": false,
  });
}

function commandMatches(command: CommandDefinition, context: ContextSnapshot): boolean {
  if (!command.when) return true;
  try {
    return compileContextExpression(command.when)(context);
  } catch {
    return false;
  }
}

function bestBinding(bindings: CompiledKeybinding[], context: ContextSnapshot): CompiledKeybinding | undefined {
  return bindings
    .filter((binding) => binding.predicate(context))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.order - a.order)[0];
}

function resolverWinners(entries: CommandSurfaceEntry[]): CommandSurfaceEntry[] {
  const byKey = new Map<string, CommandSurfaceEntry>();
  const withoutKey: CommandSurfaceEntry[] = [];

  for (const entry of entries) {
    if (!entry.key) {
      withoutKey.push(entry);
      continue;
    }

    const current = byKey.get(entry.key);
    if (!current || entry.priority > current.priority) byKey.set(entry.key, entry);
  }

  return [...byKey.values(), ...withoutKey];
}

export function getCommandSurfaceEntries(context: ContextSnapshot, surface: CommandSurface): CommandSurfaceEntry[] {
  const projectedContext = contextForCommandSurface(context, surface);
  const entries = commandRegistry.getAll().flatMap<CommandSurfaceEntry>((command) => {
    if (!commandMatches(command, projectedContext)) return [];

    const bindings = keybindingRegistry.getBindingsForCommand(command.id);
    const binding = bestBinding(bindings, projectedContext);

    // A command with declared keybindings is contextual by definition. If none of
    // those bindings apply in the projected context, it must not leak into any
    // shared command surface, including the palette. Truly unbound palette
    // commands remain valid and are governed only by command.when.
    if (bindings.length > 0 && !binding) return [];
    if (surface !== "palette" && !binding) return [];
    if (surface === "rail" && binding && RAIL_NAVIGATION_KEYS.has(binding.normalizedKey)) return [];
    if (surface === "rail" && command.id === "overlay.dismiss") return [];

    return [{
      id: command.id,
      title: command.title,
      description: command.description,
      category: command.category,
      key: binding?.normalizedKey,
      priority: binding?.priority ?? 0,
      command,
      binding,
    }];
  });

  const visibleEntries = surface === "palette" ? entries : resolverWinners(entries);
  return visibleEntries.sort((a, b) => {
    if (surface === "palette") {
      const category = (a.category ?? "Commands").localeCompare(b.category ?? "Commands");
      return category || a.title.localeCompare(b.title);
    }
    return b.priority - a.priority || a.title.localeCompare(b.title);
  });
}
