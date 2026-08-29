import type { ContextSnapshot } from "@/lib/context/context-types";
import { keybindingRegistry } from "./keybinding-registry";
import type { KeyboardResolution } from "./keyboard-types";

export function resolveKeybinding(key: string, context: ContextSnapshot): KeyboardResolution {
  const candidates = keybindingRegistry.getCandidates(key).map((binding) => ({ binding, matched: binding.predicate(context) }));
  const matching = candidates.filter((candidate) => candidate.matched).map((candidate) => candidate.binding);
  matching.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.order - a.order);
  return { key, winner: matching[0], candidates };
}
