import type { ContextPatch } from "./context-types";
import { readContextFromTarget } from "./context-scope";

type Listener = () => void;

export class FocusContextService {
  private listeners = new Set<Listener>();
  private version = 0;
  private listening = false;
  private queued = false;
  private observer: MutationObserver | null = null;

  private readonly queueChange = () => {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.version += 1;
      for (const listener of this.listeners) listener();
    });
  };

  private readonly handleScopeMutations = (mutations: MutationRecord[]) => {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (!(activeElement instanceof Element)) return;

    for (const mutation of mutations) {
      if (mutation.type !== "attributes" || mutation.attributeName !== "data-keyboard-scope") continue;
      const target = mutation.target;
      if (target instanceof Element && (target === activeElement || target.contains(activeElement))) {
        this.queueChange();
        return;
      }
    }
  };

  start(): () => void {
    if (typeof document === "undefined" || this.listening) return () => undefined;
    document.addEventListener("focusin", this.queueChange, true);
    document.addEventListener("focusout", this.queueChange, true);

    if (typeof MutationObserver !== "undefined") {
      this.observer = new MutationObserver(this.handleScopeMutations);
      this.observer.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-keyboard-scope"],
      });
    }

    this.listening = true;
    return () => {
      document.removeEventListener("focusin", this.queueChange, true);
      document.removeEventListener("focusout", this.queueChange, true);
      this.observer?.disconnect();
      this.observer = null;
      this.listening = false;
    };
  }

  snapshot(): ContextPatch {
    if (typeof document === "undefined") return {};
    return readContextFromTarget(document.activeElement);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;
}

export const focusContextService = new FocusContextService();
