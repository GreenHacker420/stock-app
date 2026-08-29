export interface ActivePointer {
  zoneId: string;
  itemId: string;
  index: number;
  columnId?: string;
}

export interface ActivePointerSnapshot {
  pointer: ActivePointer | null;
  selectedIds: ReadonlySet<string>;
  version: number;
}

const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();
const SERVER_SNAPSHOT: ActivePointerSnapshot = Object.freeze({
  pointer: null,
  selectedIds: EMPTY_SELECTION,
  version: 0,
});

function samePointer(left: ActivePointer | null, right: ActivePointer | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.zoneId === right.zoneId &&
    left.itemId === right.itemId &&
    left.index === right.index &&
    left.columnId === right.columnId
  );
}

class ActivePointerStore {
  private pointer: ActivePointer | null = null;
  private selectedIds = new Set<string>();
  private version = 0;
  private snapshot: ActivePointerSnapshot = Object.freeze({
    pointer: null,
    selectedIds: this.selectedIds,
    version: this.version,
  });
  private readonly listeners = new Set<() => void>();

  getPointer(): ActivePointer | null {
    return this.pointer;
  }

  getSelectedIds(): ReadonlySet<string> {
    return this.selectedIds;
  }

  getSnapshot = (): ActivePointerSnapshot => this.snapshot;

  getServerSnapshot = (): ActivePointerSnapshot => SERVER_SNAPSHOT;

  setPointer(pointer: ActivePointer | null): void {
    if (samePointer(this.pointer, pointer)) return;
    this.pointer = pointer;
    this.publish();
  }

  toggleSelection(id: string): void {
    const next = new Set(this.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds = next;
    this.publish();
  }

  setSelection(ids: Iterable<string>): void {
    const next = new Set(ids);
    if (
      next.size === this.selectedIds.size &&
      [...next].every((id) => this.selectedIds.has(id))
    ) {
      return;
    }
    this.selectedIds = next;
    this.publish();
  }

  reset(): void {
    if (!this.pointer && this.selectedIds.size === 0) return;
    this.pointer = null;
    this.selectedIds = new Set();
    this.publish();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(): void {
    this.version += 1;
    this.snapshot = Object.freeze({
      pointer: this.pointer,
      selectedIds: this.selectedIds,
      version: this.version,
    });
    for (const listener of this.listeners) listener();
  }
}

export const activePointerStore = new ActivePointerStore();
