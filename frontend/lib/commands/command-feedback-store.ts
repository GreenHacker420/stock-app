export interface CommandFeedbackSnapshot {
  commandId: string | null;
  sequence: number;
}

type Listener = () => void;

class CommandFeedbackStore {
  private snapshot: CommandFeedbackSnapshot = { commandId: null, sequence: 0 };
  private readonly serverSnapshot: CommandFeedbackSnapshot = { commandId: null, sequence: 0 };
  private listeners = new Set<Listener>();
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  trigger(commandId: string, durationMs = 160): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.snapshot = { commandId, sequence: this.snapshot.sequence + 1 };
    this.emit();
    this.clearTimer = setTimeout(() => {
      this.snapshot = { commandId: null, sequence: this.snapshot.sequence + 1 };
      this.clearTimer = null;
      this.emit();
    }, durationMs);
  }

  reset(): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = null;
    if (this.snapshot.commandId === null) return;
    this.snapshot = { commandId: null, sequence: this.snapshot.sequence + 1 };
    this.emit();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CommandFeedbackSnapshot => this.snapshot;
  getServerSnapshot = (): CommandFeedbackSnapshot => this.serverSnapshot;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const commandFeedbackStore = new CommandFeedbackStore();
