export type TransactionScope =
  | "DIALOG"
  | "COMBOBOX"
  | "CELL_EDIT"
  | "GRID"
  | "FORM"
  | "PAGE"
  | "GLOBAL";

export type InteractionMode =
  | "NAVIGATION"
  | "EDITING"
  | "COMBOBOX"
  | "DIALOG";

export const SCOPE_PRIORITY: Record<TransactionScope, number> = {
  DIALOG: 7,
  COMBOBOX: 6,
  CELL_EDIT: 5,
  GRID: 4,
  FORM: 3,
  PAGE: 2,
  GLOBAL: 1,
};

export interface FocusZoneDefinition {
  id: string;
  name: string;
  scope: TransactionScope;
  parentZoneId?: string;
}

export interface KeyboardHint {
  key: string;
  label: string;
}

export type GridColumnId =
  | "product"
  | "quantity"
  | "rate"
  | "discount"
  | "serials"
  | "total"
  | "remove"
  | "paymentMode"
  | "amount"
  | "reference";
