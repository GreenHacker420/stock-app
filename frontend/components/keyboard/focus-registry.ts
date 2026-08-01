import type { TransactionScope, InteractionMode } from "./keyboard-intents";

export interface RegisteredField {
  id: string;
  zoneId: string;
  element: HTMLElement | null;
  rowIndex?: number;
  colIndex?: number;
  columnId?: string;
  disabled?: boolean;
}

export class FocusRegistry {
  private fields = new Map<string, RegisteredField>();
  private activeFieldId: string | null = null;
  private activeZoneId: string = "SALE_HEADER";
  private currentMode: InteractionMode = "NAVIGATION";
  private focusHistory: string[] = [];
  private listeners = new Set<() => void>();

  register(field: RegisteredField): () => void {
    this.fields.set(field.id, field);
    this.notify();
    return () => {
      this.unregister(field.id);
    };
  }

  unregister(id: string): void {
    this.fields.delete(id);
    if (this.activeFieldId === id) {
      this.activeFieldId = null;
    }
    this.notify();
  }

  updateElement(id: string, element: HTMLElement | null): void {
    const existing = this.fields.get(id);
    if (existing) {
      existing.element = element;
    }
  }

  getField(id: string): RegisteredField | undefined {
    return this.fields.get(id);
  }

  getAllFields(): RegisteredField[] {
    return Array.from(this.fields.values());
  }

  getFieldsInZone(zoneId: string): RegisteredField[] {
    return this.getAllFields().filter((f) => f.zoneId === zoneId && !f.disabled);
  }

  getActiveFieldId(): string | null {
    return this.activeFieldId;
  }

  getActiveZoneId(): string {
    return this.activeZoneId;
  }

  getMode(): InteractionMode {
    return this.currentMode;
  }

  setMode(mode: InteractionMode): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.notify();
    }
  }

  setActiveField(id: string | null, zoneId?: string): void {
    if (id && this.activeFieldId !== id) {
      if (this.activeFieldId) {
        this.focusHistory.push(this.activeFieldId);
        if (this.focusHistory.length > 20) this.focusHistory.shift();
      }
      this.activeFieldId = id;
      const field = this.fields.get(id);
      if (field) {
        this.activeZoneId = zoneId || field.zoneId;
        // Focus element safely if DOM element present
        if (field.element && document.activeElement !== field.element) {
          field.element.focus();
        }
      }
      this.notify();
    } else if (!id) {
      this.activeFieldId = null;
      this.notify();
    }
  }

  restorePreviousFocus(): boolean {
    const prevId = this.focusHistory.pop();
    if (prevId && this.fields.has(prevId)) {
      this.setActiveField(prevId);
      return true;
    }
    return false;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  clear(): void {
    this.fields.clear();
    this.activeFieldId = null;
    this.focusHistory = [];
    this.notify();
  }
}

export const focusRegistry = new FocusRegistry();
