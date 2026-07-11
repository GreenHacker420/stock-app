export interface TaxonomyEntity {
  id: string;
  name: string;
  productCount?: number;
}

export interface TaxonomyCopy {
  singular: string;
  plural: string;
  screenTitle: string;
  screenSubtitle: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptySubtitle: string;
  noMatchesTitle: string;
  noMatchesSubtitle: string;
  infoText: string;
  createErrorFallback: string;
  updateErrorFallback: string;
  deleteErrorFallback: string;
  actionsSubtitle?: string;
  editActionTitle?: string;
  editActionDescription?: string;
  deleteActionTitle?: string;
  deleteActionDescription?: string;
}

export interface TaxonomyIcons {
  row: string;
  empty: string;
  add: string;
}

export interface TaxonomyQueryState {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  onRefresh: () => void;
}

export interface TaxonomyManagementProps<T extends TaxonomyEntity> {
  items: readonly T[];
  copy: TaxonomyCopy;
  icons: TaxonomyIcons;
  queryState: TaxonomyQueryState;

  onCreate: (name: string) => Promise<void>;
  onUpdate: (entity: T, name: string) => Promise<void>;
  onDelete: (entity: T) => Promise<void>;
  onOpen: (entity: T) => void;

  getItemCount?: (entity: T) => number | undefined;
}

export type EditorSession<T extends TaxonomyEntity> =
  | { sessionId: number; mode: "create"; entity: null }
  | { sessionId: number; mode: "edit"; entity: T };
