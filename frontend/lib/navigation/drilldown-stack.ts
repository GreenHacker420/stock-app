import type { NavigationFrame } from "./navigation-frame";

type Listener = () => void;

class DrilldownStack {
  private frames: NavigationFrame[] = [];
  private listeners = new Set<Listener>();
  private version = 0;

  push(frame: NavigationFrame): void {
    this.frames.push(frame);
    this.bump();
  }

  pop(): NavigationFrame | undefined {
    const frame = this.frames.pop();
    if (frame) this.bump();
    return frame;
  }

  peek(): NavigationFrame | undefined {
    return this.frames[this.frames.length - 1];
  }

  clear(): void {
    if (!this.frames.length) return;
    this.frames = [];
    this.bump();
  }

  size(): number {
    return this.frames.length;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;

  private bump(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export const drilldownStack = new DrilldownStack();
