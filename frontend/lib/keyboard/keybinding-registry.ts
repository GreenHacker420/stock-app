import { compileContextExpression } from "@/lib/context/context-expression";
import { normalizeKeyString } from "./keyboard-normalizer";
import type { CompiledKeybinding, KeybindingRule } from "./keyboard-types";

export class KeybindingRegistry {
  private index = new Map<string, CompiledKeybinding[]>();
  private byId = new Map<string, CompiledKeybinding>();
  private order = 0;
  private listeners = new Set<() => void>();
  private version = 0;

  register(rule: KeybindingRule): () => void {
    if (this.byId.has(rule.id)) throw new Error(`Keybinding already registered: ${rule.id}`);
    const compiled: CompiledKeybinding = { ...rule, normalizedKey: normalizeKeyString(rule.key), predicate: compileContextExpression(rule.when), order: this.order++ };
    this.byId.set(rule.id, compiled);
    const list = this.index.get(compiled.normalizedKey) ?? [];
    list.push(compiled);
    this.index.set(compiled.normalizedKey, list);
    this.bump();
    return () => this.unregister(rule.id);
  }

  unregister(id: string): void {
    const binding = this.byId.get(id);
    if (!binding) return;
    this.byId.delete(id);
    const list = (this.index.get(binding.normalizedKey) ?? []).filter((item) => item.id !== id);
    if (list.length) this.index.set(binding.normalizedKey, list); else this.index.delete(binding.normalizedKey);
    this.bump();
  }

  clear(): void {
    if (!this.byId.size) return;
    this.index.clear();
    this.byId.clear();
    this.order = 0;
    this.bump();
  }

  getCandidates(key: string): readonly CompiledKeybinding[] { return this.index.get(key) ?? []; }
  getBindingsForCommand(command: string): CompiledKeybinding[] { return [...this.byId.values()].filter((binding) => binding.command === command); }
  getAll(): CompiledKeybinding[] { return [...this.byId.values()]; }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;

  private bump(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export const keybindingRegistry = new KeybindingRegistry();
