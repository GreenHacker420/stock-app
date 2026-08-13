export interface CommandFeedbackSnapshot {
  commandId: string | null;
  key: string | null;
  version: number;
}

const SERVER_SNAPSHOT: CommandFeedbackSnapshot = Object.freeze({
  commandId: null,
  key: null,
  version: 0,
});

class CommandFeedbackStore {
  private version = 0;
  private snapshot: CommandFeedbackSnapshot = SERVER_SNAPSHOT;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): CommandFeedbackSnapshot => this.snapshot;

  getServerSnapshot = (): CommandFeedbackSnapshot => SERVER_SNAPSHOT;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(commandId: string, key?: string): void {
    if (this.clearTimer) clearTimeout(this.clearTimer);

    this.version += 1;
    this.snapshot = Object.freeze({
      commandId,
      key: key ?? null,
      version: this.version,
    });
    this.emit();

    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      this.version += 1;
      this.snapshot = Object.freeze({
        commandId: null,
        key: null,
        version: this.version,
      });
      this.emit();
    }, 650);
  }

  reset(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    if (!this.snapshot.commandId && !this.snapshot.key) return;
    this.version += 1;
    this.snapshot = Object.freeze({
      commandId: null,
      key: null,
      version: this.version,
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const commandFeedbackStore = new CommandFeedbackStore();
