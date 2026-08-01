export interface ComboboxItem<T = any> {
  id: string;
  label: string;
  data: T;
}

export class ComboboxKeyboardController<T = any> {
  private items: ComboboxItem<T>[] = [];
  private activeIndex: number = -1;
  private isOpen: boolean = false;

  setItems(items: ComboboxItem<T>[]): void {
    this.items = items;
    if (this.activeIndex >= items.length) {
      this.activeIndex = items.length > 0 ? 0 : -1;
    }
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
    if (open && this.items.length > 0 && this.activeIndex === -1) {
      this.activeIndex = 0;
    } else if (!open) {
      this.activeIndex = -1;
    }
  }

  getIsOpen(): boolean {
    return this.isOpen;
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  getActiveItem(): ComboboxItem<T> | undefined {
    if (this.activeIndex >= 0 && this.activeIndex < this.items.length) {
      return this.items[this.activeIndex];
    }
    return undefined;
  }

  handleKeyDown(e: KeyboardEvent): { handled: boolean; action?: "SELECT" | "CLOSE" | "NAVIGATE" } {
    if (!this.isOpen || this.items.length === 0) {
      if (e.key === "ArrowDown" || e.key === "F4") {
        this.setOpen(true);
        return { handled: true, action: "NAVIGATE" };
      }
      return { handled: false };
    }

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        this.activeIndex = Math.min(this.items.length - 1, this.activeIndex + 1);
        return { handled: true, action: "NAVIGATE" };
      }

      case "ArrowUp": {
        e.preventDefault();
        this.activeIndex = Math.max(0, this.activeIndex - 1);
        return { handled: true, action: "NAVIGATE" };
      }

      case "Home": {
        e.preventDefault();
        this.activeIndex = 0;
        return { handled: true, action: "NAVIGATE" };
      }

      case "End": {
        e.preventDefault();
        this.activeIndex = this.items.length - 1;
        return { handled: true, action: "NAVIGATE" };
      }

      case "PageDown": {
        e.preventDefault();
        this.activeIndex = Math.min(this.items.length - 1, this.activeIndex + 5);
        return { handled: true, action: "NAVIGATE" };
      }

      case "PageUp": {
        e.preventDefault();
        this.activeIndex = Math.max(0, this.activeIndex - 5);
        return { handled: true, action: "NAVIGATE" };
      }

      case "Enter": {
        e.preventDefault();
        const item = this.getActiveItem();
        if (item) {
          return { handled: true, action: "SELECT" };
        }
        return { handled: false };
      }

      case "Escape": {
        e.preventDefault();
        this.setOpen(false);
        return { handled: true, action: "CLOSE" };
      }

      default:
        return { handled: false };
    }
  }
}
