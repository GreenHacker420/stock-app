import { PERMISSIONS } from "@/lib/permissions/permissions";

export type FeatureId =
  | "SALE_CREATE"
  | "ORDER_CREATE"
  | "DM_CREATE"
  | "PAYMENT_CREATE"
  | "STOCK_ENTRY"
  | "STOCK_TRANSFER"
  | "PHYSICAL_STOCK";

export type FeatureStatus = "ENABLED" | "DISABLED" | "UNSUPPORTED";

export interface FeatureDefinition {
  id: FeatureId;
  label: string;
  status: FeatureStatus;
  route: string;
  requiredPermission: string;
  shortcut: string | null;
  disabledReason?: string;
  nextSprint?: string;
}

export const FEATURE_REGISTRY: Record<FeatureId, FeatureDefinition> = {
  SALE_CREATE: {
    id: "SALE_CREATE",
    label: "New Sale",
    status: "ENABLED",
    route: "/sales/new",
    requiredPermission: PERMISSIONS.SALE_CREATE,
    shortcut: "f8",
  },

  ORDER_CREATE: {
    id: "ORDER_CREATE",
    label: "New Order",
    status: "ENABLED",
    route: "/orders/new",
    requiredPermission: PERMISSIONS.ORDER_CREATE,
    shortcut: "ctrl+f8",
  },

  DM_CREATE: {
    id: "DM_CREATE",
    label: "Delivery Memo",
    status: "ENABLED",
    route: "/delivery-memos/new",
    requiredPermission: PERMISSIONS.DM_CREATE,
    shortcut: "alt+f8",
  },

  PAYMENT_CREATE: {
    id: "PAYMENT_CREATE",
    label: "Receive Payment",
    status: "ENABLED",
    route: "/payments/new",
    requiredPermission: PERMISSIONS.PAYMENT_CREATE,
    shortcut: "f6",
  },

  STOCK_ENTRY: {
    id: "STOCK_ENTRY",
    label: "Stock Entry",
    status: "DISABLED",
    route: "/inventory/stock-entry",
    requiredPermission: PERMISSIONS.STOCK_CREATE_MOVEMENT,
    shortcut: "f9",
    disabledReason: "Stock Entry is not available in this sprint. Coming in Write Recovery Sprint 2.",
    nextSprint: "Write Recovery Sprint 2",
  },

  STOCK_TRANSFER: {
    id: "STOCK_TRANSFER",
    label: "Stock Transfer",
    status: "DISABLED",
    route: "/inventory/stock-transfer",
    requiredPermission: PERMISSIONS.STOCK_CREATE_MOVEMENT,
    shortcut: "alt+f9",
    disabledReason: "Stock Transfer is not available in this sprint. Coming in Write Recovery Sprint 2.",
    nextSprint: "Write Recovery Sprint 2",
  },

  PHYSICAL_STOCK: {
    id: "PHYSICAL_STOCK",
    label: "Physical Stock",
    status: "UNSUPPORTED",
    route: "/inventory/physical-stock",
    requiredPermission: PERMISSIONS.STOCK_CREATE_MOVEMENT,
    shortcut: null,
    disabledReason: "Physical Stock verification is not implemented. No ETA confirmed.",
  },
};

export function getActionableFeatures(): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter((feature) => feature.status !== "UNSUPPORTED");
}

export function getEnabledFeatures(): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter((feature) => feature.status === "ENABLED");
}

export function getFeature(id: FeatureId): FeatureDefinition {
  return FEATURE_REGISTRY[id];
}

export function isShortcutRegistrable(feature: FeatureDefinition): boolean {
  return feature.status === "ENABLED" && feature.shortcut !== null;
}
