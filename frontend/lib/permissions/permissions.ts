export const PERMISSIONS = {
  SHOP_CREATE: "shop:create",
  SHOP_VIEW: "shop:view",
  SHOP_UPDATE: "shop:update",
  SHOP_ASSIGN_STAFF: "shop:assign_staff",
  OPENING_STOCK_SET: "stock:set_opening",

  CUSTOMER_CREATE: "customer:create",
  CUSTOMER_VIEW: "customer:view",
  CUSTOMER_UPDATE: "customer:update",

  ITEM_CREATE: "item:create",
  ITEM_VIEW: "item:view",
  ITEM_UPDATE: "item:update",

  STOCK_CREATE_MOVEMENT: "stock:create_movement",
  STOCK_VIEW: "stock:view",

  CASH_SESSION_OPEN: "cash_session:open",
  CASH_SESSION_CLOSE: "cash_session:close",
  CASH_SESSION_REVIEW: "cash_session:review",

  ORDER_CREATE: "order:create",
  ORDER_VIEW_ALL: "order:view_all",
  ORDER_VIEW_ASSIGNED: "order:view_assigned",
  ORDER_UPDATE: "order:update",
  ORDER_ASSIGN_STAFF: "order:assign_staff",
  PACKING_UPDATE: "packing:update",
  DISPATCH_CREATE: "dispatch:create",

  SALE_CREATE: "sale:create",
  SALE_VIEW_ALL: "sale:view_all",
  SALE_VIEW_OWN: "sale:view_own",
  SALE_EDIT_DRAFT: "sale:edit_draft",
  SALE_AMEND_CONFIRMED: "sale:amend_confirmed",
  INVOICE_ISSUE: "invoice:issue",
  INVOICE_CANCEL: "invoice:cancel",
  INVOICE_VIEW: "invoice:view",

  DM_CREATE: "dm:create",
  DM_VIEW_ALL: "dm:view_all",
  DM_VIEW_OWN: "dm:view_own",

  PAYMENT_CREATE: "payment:create",
  PAYMENT_VIEW_ALL: "payment:view_all",
  PAYMENT_VIEW_OWN: "payment:view_own",
  PAYMENT_VERIFY: "payment:verify",

  EXPENSE_CREATE: "expense:create",
  EXPENSE_VIEW: "expense:view",
  EXPENSE_VERIFY: "expense:verify",
  EXPENSE_DELETE: "expense:delete",

  DAILY_SUMMARY_VIEW: "daily_summary:view",
  DAILY_SUMMARY_LOCK: "daily_summary:lock",
  DAILY_SUMMARY_EXPORT: "daily_summary:export",

  RATE_CHANGE_REQUEST: "rate:change_request",
  RATE_CHANGE_REVIEW: "rate:review",
  CORRECTION_REQUEST: "correction:request",
  CORRECTION_APPROVE: "correction:approve",
  NOTIFICATION_VIEW: "notification:view",
  AUDIT_LOG_VIEW: "audit_log:view",
} as const;

export type UserRole = "OWNER" | "STAFF";

export interface UserPermissionsSubject {
  role: UserRole;
  permissions?: string[];
}

export function hasPermission(
  user: UserPermissionsSubject | null | undefined,
  permission: string
): boolean {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  if (Array.isArray(user.permissions)) {
    return user.permissions.includes(permission);
  }
  return false;
}
