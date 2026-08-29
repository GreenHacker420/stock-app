import type { ContextSnapshot } from "@/lib/context/context-types";
import type { KeyboardResolution } from "./keyboard-types";

export interface KeyboardDiagnosticEntry {
  at: number;
  key: string;
  context: ContextSnapshot;
  resolution: KeyboardResolution;
}

class KeyboardDiagnostics {
  private latest: KeyboardDiagnosticEntry | null = null;
  private listeners = new Set<() => void>();
  record(entry: KeyboardDiagnosticEntry): void { this.latest = entry; for (const listener of this.listeners) listener(); }
  getLatest(): KeyboardDiagnosticEntry | null { return this.latest; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

export const keyboardDiagnostics = new KeyboardDiagnostics();
