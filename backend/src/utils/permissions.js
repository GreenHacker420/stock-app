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
};

export const OWNER_PERMISSIONS = Object.values(PERMISSIONS);

export const STAFF_PERMISSIONS = [
  PERMISSIONS.SHOP_VIEW,
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.CUSTOMER_CREATE,
  PERMISSIONS.ITEM_VIEW,          // staff can VIEW catalog
  // ITEM_CREATE and ITEM_UPDATE intentionally excluded – owner only
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.STOCK_CREATE_MOVEMENT, // routed through approval in bulkStockEntry
  PERMISSIONS.CASH_SESSION_OPEN,
  PERMISSIONS.CASH_SESSION_CLOSE,
  PERMISSIONS.ORDER_VIEW_ASSIGNED,
  PERMISSIONS.PACKING_UPDATE,
  PERMISSIONS.DISPATCH_CREATE,
  PERMISSIONS.SALE_CREATE,
  PERMISSIONS.SALE_VIEW_OWN,
  PERMISSIONS.DM_CREATE,
  PERMISSIONS.DM_VIEW_OWN,
  PERMISSIONS.PAYMENT_CREATE,
  PERMISSIONS.PAYMENT_VIEW_OWN,
  PERMISSIONS.EXPENSE_CREATE,
  PERMISSIONS.EXPENSE_VIEW,
  PERMISSIONS.RATE_CHANGE_REQUEST,
  PERMISSIONS.CORRECTION_REQUEST,
  PERMISSIONS.NOTIFICATION_VIEW,
];
