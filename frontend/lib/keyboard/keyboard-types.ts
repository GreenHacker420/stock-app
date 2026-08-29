import type { ContextPredicate } from "@/lib/context/context-types";

export interface KeybindingRule {
  id: string;
  key: string;
  command: string;
  when?: string;
  priority?: number;
  allowRepeat?: boolean;
  preventDefault?: boolean;
}

export interface CompiledKeybinding extends KeybindingRule {
  normalizedKey: string;
  predicate: ContextPredicate;
  order: number;
}

export interface KeyboardResolution {
  key: string;
  winner?: CompiledKeybinding;
  candidates: Array<{ binding: CompiledKeybinding; matched: boolean }>;
}
