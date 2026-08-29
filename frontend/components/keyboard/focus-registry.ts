import type { InteractionMode } from "./keyboard-intents";

export interface RegisteredField {
  id: string;
  zoneId: string;
  element: HTMLElement | null;
  rowIndex?: number;
  colIndex?: number;
  columnId?: string;
  order?: number;
  disabled?: boolean;
}

export class FocusRegistry {
  private fields = new Map<string, RegisteredField>();
  private activeFieldId: string | null = null;
  private activeZoneId = "SALE_HEADER";
  private currentMode: InteractionMode = "NAVIGATION";
  private focusHistory: string[] = [];
  private readonly listeners = new Set<() => void>();

  register(field: RegisteredField): () => void {
    this.fields.set(field.id, field);
    this.notify();
    return () => this.unregister(field.id);
  }

  unregister(id: string): void {
    this.fields.delete(id);
    if (this.activeFieldId === id) this.activeFieldId = null;
    this.notify();
  }

  updateElement(id: string, element: HTMLElement | null): void {
    const existing = this.fields.get(id);
    if (existing) existing.element = element;
  }

  getField(id: string): RegisteredField | undefined {
    return this.fields.get(id);
  }

  getAllFields(): RegisteredField[] {
    return Array.from(this.fields.values());
  }

  getFieldsInZone(zoneId: string): RegisteredField[] {
    return this.getAllFields().filter((field) => field.zoneId === zoneId && !field.disabled);
  }

  getOrderedFields(): RegisteredField[] {
    return this.getAllFields()
      .filter((field) => !field.disabled && field.element && field.order !== undefined)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
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
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.notify();
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
        if (field.element && document.activeElement !== field.element) field.element.focus();
      }
      this.notify();
      return;
    }

    if (!id && this.activeFieldId !== null) {
      this.activeFieldId = null;
      this.notify();
    }
  }

  restorePreviousFocus(): boolean {
    const previousId = this.focusHistory.pop();
    if (!previousId || !this.fields.has(previousId)) return false;
    this.setActiveField(previousId);
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.fields.clear();
    this.activeFieldId = null;
    this.activeZoneId = "SALE_HEADER";
    this.currentMode = "NAVIGATION";
    this.focusHistory = [];
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

export const focusRegistry = new FocusRegistry();
