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
};

export const OWNER_PERMISSIONS = Object.values(PERMISSIONS);

export const STAFF_PERMISSIONS = [
  PERMISSIONS.SHOP_VIEW,
  PERMISSIONS.CUSTOMER_VIEW,
  PERMISSIONS.ITEM_VIEW,
  PERMISSIONS.STOCK_CREATE_MOVEMENT,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.CASH_SESSION_OPEN,
  PERMISSIONS.CASH_SESSION_CLOSE,
];
