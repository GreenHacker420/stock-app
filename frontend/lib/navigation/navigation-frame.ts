import type { ActivePointer } from "@/lib/focus/active-pointer-store";
export interface NavigationFrame {
  route: string;
  searchParams?: string;
  module?: string;
  view?: string;
  activePointer?: ActivePointer | null;
  selectedIds?: string[];
  filters?: Record<string, unknown>;
  sorting?: unknown;
  page?: number;
  scrollOffset?: number;
}
