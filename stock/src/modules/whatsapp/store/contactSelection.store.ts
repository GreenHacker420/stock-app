import { create } from "zustand";

interface SelectionState {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectMany: (ids: string[]) => void;
  deselectMany: (ids: string[]) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set<string>(),
  toggle: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),
  selectMany: (ids) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      ids.forEach((id) => next.add(id));
      return { selectedIds: next };
    }),
  deselectMany: (ids) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      ids.forEach((id) => next.delete(id));
      return { selectedIds: next };
    }),
  clear: () => set({ selectedIds: new Set<string>() }),
}));
