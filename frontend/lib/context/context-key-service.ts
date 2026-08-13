import type { ContextPatch, ContextSnapshot, ContextValue } from "./context-types";

export class ContextKeyService {
  private values = new Map<string, ContextValue>();
  private version = 0;
  private cachedVersion = -1;
  private cachedSnapshot: ContextSnapshot = {};
  private listeners = new Set<() => void>();

  get(key: string): ContextValue { return this.values.get(key); }

  set(key: string, value: ContextValue): void {
    if (Object.is(this.values.get(key), value)) return;
    if (value === undefined) this.values.delete(key); else this.values.set(key, value);
    this.version += 1;
    this.emit();
  }

  patch(values: ContextPatch): void {
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      if (Object.is(this.values.get(key), value)) continue;
      if (value === undefined) this.values.delete(key); else this.values.set(key, value);
      changed = true;
    }
    if (changed) { this.version += 1; this.emit(); }
  }

  snapshot(overlay?: ContextPatch): ContextSnapshot {
    if (this.cachedVersion !== this.version) {
      this.cachedSnapshot = Object.freeze(Object.fromEntries(this.values));
      this.cachedVersion = this.version;
    }
    return overlay ? Object.freeze({ ...this.cachedSnapshot, ...overlay }) : this.cachedSnapshot;
  }

  reset(): void {
    if (this.values.size === 0) return;
    this.values.clear();
    this.version += 1;
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;

  private emit(): void { for (const listener of this.listeners) listener(); }
}

export const contextKeyService = new ContextKeyService();
