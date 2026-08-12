export type DecimalValue = number | string;

export type CustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  city?: string | null;
  type?: "WALK_IN" | "REGULAR" | "BUSINESS";
};

export type SaleRegisterRow = {
  id: string;
  saleNumber: string;
  shopId: string;
  customerId: string;
  isWalkin: boolean;
  subtotal: DecimalValue;
  discountAmount: DecimalValue;
  totalAmount: DecimalValue;
  paidAmount: DecimalValue;
  balanceAmount: DecimalValue;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  saleStatus: "DRAFT" | "CONFIRMED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "RETURNED";
  gstRequired: boolean;
  gstInvoiceStatus: string;
  gstInvoiceNumber: string | null;
  gstInvoiceGeneratedAt: string | null;
  saleDate: string;
  createdAt: string;
  customer: CustomerSummary;
  staff: { id: string; name: string; role: "OWNER" | "STAFF" };
  _count: { items: number; payments: number };
};

export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "PACKING"
  | "PARTIALLY_PACKED"
  | "PACKED"
  | "PARTIALLY_DISPATCHED"
  | "DISPATCHED"
  | "CANCELLED";

export type OrderRegisterRow = {
  id: string;
  orderNumber: string;
  shopId: string;
  customerId: string;
  createdById: string;
  assignedStaffId: string | null;
  expectedDispatchDate: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: OrderStatus;
  subtotal: DecimalValue;
  discountAmount: DecimalValue;
  totalAmount: DecimalValue;
  paidAmount: DecimalValue;
  balanceAmount: DecimalValue;
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  ownerNotes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary;
  items: Array<{
    id: string;
    itemId: string;
    quantityOrdered: DecimalValue;
    quantityPending: DecimalValue;
    rate: DecimalValue;
    lineTotal: DecimalValue;
    item: { id: string; name: string; sku: string | null; unit: string };
  }>;
};

export type DeliveryMemoRegisterRow = {
  id: string;
  dmNumber: string;
  shopId: string;
  staffId: string;
  customerId: string;
  orderId?: string | null;
  estimatedAmount: DecimalValue;
  paidAmount: DecimalValue;
  balanceAmount: DecimalValue;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  status: "CREATED" | "PARTIALLY_PAID" | "FULLY_PAID" | "CONVERTED_TO_SALE" | "RETURNED" | "CANCELLED" | "OVERDUE";
  lifecycleStatus: "DRAFT" | "READY_TO_DISPATCH" | "DISPATCHED" | "CANCELLATION_PENDING" | "CANCELLED" | "CLOSED";
  invoicingStatus?: "NOT_INVOICED" | "PARTIALLY_INVOICED" | "FULLY_INVOICED";
  returnStatus?: "NO_RETURN" | "PARTIALLY_RETURNED" | "FULLY_RETURNED";
  documentPurpose?: string;
  expectedPaymentDate: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  customer: CustomerSummary;
  items: Array<{
    id: string;
    itemId: string;
    quantity: DecimalValue;
    rate: DecimalValue;
    totalAmount: DecimalValue;
    item: { id: string; name: string; sku: string | null; unit: string };
  }>;
  payments: Array<{ id: string; amount: DecimalValue; status: string }>;
};

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
export type PaymentStatus = "RECORDED" | "VERIFIED" | "REJECTED" | "CANCELLED";

export type PaymentRegisterRow = {
  id: string;
  shopId: string;
  customerId: string | null;
  saleId: string | null;
  dmId: string | null;
  orderId: string | null;
  receivedById: string;
  paymentMode: PaymentMode;
  amount: DecimalValue;
  status: PaymentStatus;
  receivedAt: string;
  paymentDate?: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  customer: CustomerSummary | null;
  receivedBy: { id: string; name: string };
  sale: { id: string; saleNumber: string } | null;
  order: { id: string; orderNumber: string } | null;
  details: Record<string, unknown> | null;
};

export type CustomerRegisterRow = {
  id: string;
  shopId: string;
  name: string;
  type: "WALK_IN" | "REGULAR" | "BUSINESS";
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  gstin: string | null;
  contactPerson: string | null;
  creditLimit: DecimalValue | null;
  outstandingAmount: DecimalValue;
  advanceBalance: DecimalValue;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type ExpenseRegisterRow = {
  id: string;
  shopId: string;
  cashSessionId: string;
  amount: DecimalValue;
  category: string;
  note: string | null;
  photoUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  verificationNote: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  verifiedBy: { id: string; name: string } | null;
};

export type RegisterPageParams = {
  shopId: string;
  page?: number;
  limit?: number;
};
