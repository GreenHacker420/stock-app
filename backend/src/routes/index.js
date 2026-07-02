import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import shopRoutes from "./shop.routes.js";
import customerRoutes from "./customer.routes.js";
import itemRoutes from "./item.routes.js";
import stockRoutes from "./stock.routes.js";
import cashSessionRoutes from "./cashSession.routes.js";
import orderRoutes from "./order.routes.js";
import saleRoutes from "./sale.routes.js";
import deliveryMemoRoutes from "./deliveryMemo.routes.js";
import paymentRoutes from "./payment.routes.js";
import dailySummaryRoutes from "./dailySummary.routes.js";
import notificationRoutes from "./notification.routes.js";
import approvalRoutes from "./approval.routes.js";
import auditLogRoutes from "./auditLog.routes.js";
import chequeRoutes from "./cheque.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import expenseRoutes from "./expense.routes.js";
import rateChangeRoutes from "./rateChange.routes.js";
import correctionRoutes from "./correction.routes.js";
import whatsappRoutes from "./whatsapp.routes.js";
import syncRoutes from "./sync.routes.js";
import attendanceRoutes from "./attendance.routes.js";

export const appRoutes = [
  ["/auth", authRoutes],
  ["/users", userRoutes],
  ["/shops", shopRoutes],
  ["/customers", customerRoutes],
  ["/items", itemRoutes],
  ["/stock", stockRoutes],
  ["/cash-sessions", cashSessionRoutes],
  ["/orders", orderRoutes],
  ["/sales", saleRoutes],
  ["/delivery-memos", deliveryMemoRoutes],
  ["/payments", paymentRoutes],
  ["/daily-summary", dailySummaryRoutes],
  ["/daily-summaries", dailySummaryRoutes],
  ["/notifications", notificationRoutes],
  ["/approvals", approvalRoutes],
  ["/audit-logs", auditLogRoutes],
  ["/cheques", chequeRoutes],
  ["/dashboard", dashboardRoutes],
  ["/expenses", expenseRoutes],
  ["/rate-change-requests", rateChangeRoutes],
  ["/correction-requests", correctionRoutes],
  ["/whatsapp", whatsappRoutes],
  ["/sync", syncRoutes],
  ["/attendance", attendanceRoutes],
];

export function mountAppRoutes(app) {
  for (const [prefix, router] of appRoutes) {
    app.use(prefix, router);
  }
}
