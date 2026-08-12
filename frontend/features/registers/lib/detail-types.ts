import type {
  CustomerSummary,
  DecimalValue,
  DeliveryMemoRegisterRow,
  OrderRegisterRow,
  PaymentMode,
  PaymentStatus,
} from "@/features/registers/lib/register-types";

export type OrderDetail = OrderRegisterRow & {
  assignedStaff: { id: string; name: string; mobile: string } | null;
  events: Array<{
    id: string;
    eventType: string;
    oldStatus: string | null;
    newStatus: string | null;
    note: string | null;
    createdAt: string;
    createdById: string;
  }>;
  payments: Array<{
    id: string;
    amount: DecimalValue;
    paymentMode: PaymentMode;
    status: PaymentStatus;
    receivedAt: string;
    referenceNumber: string | null;
  }>;
  dispatches: Array<{
    id: string;
    status: string;
    dispatchedAt?: string | null;
    createdAt?: string;
    items: Array<{ id: string; quantity: DecimalValue }>;
  }>;
};

export type DeliveryMemoDetail = DeliveryMemoRegisterRow & {
  staff: { id: string; name: string };
  shop: {
    id: string;
    name: string;
    code: string;
    city: string;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    logo: string | null;
  };
  order: { id: string; orderNumber: string } | null;
  deliveryNotes?: string | null;
  version?: number;
  postedAt?: string | null;
  sales: Array<{ id: string; saleNumber: string }>;
  dispatches: Array<Record<string, unknown>>;
  inventoryReturns: Array<{
    id: string;
    status: string;
    netAmount?: DecimalValue;
    updatedAt: string;
    items: Array<Record<string, unknown>>;
  }>;
  payments: Array<{
    id: string;
    amount: DecimalValue;
    paymentMode: PaymentMode;
    status: PaymentStatus;
    receivedAt?: string;
    createdAt: string;
    referenceNumber?: string | null;
  }>;
};

export type PaymentDetail = {
  id: string;
  shopId: string;
  customerId: string | null;
  saleId: string | null;
  dmId: string | null;
  orderId: string | null;
  receivedById: string;
  verifiedById: string | null;
  paymentMode: PaymentMode;
  amount: DecimalValue;
  status: PaymentStatus;
  receivedAt: string;
  verifiedAt: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  details: Record<string, unknown> | null;
  sale: ({ id: string; saleNumber: string } & Record<string, unknown>) | null;
  deliveryMemo: ({ id: string; dmNumber: string } & Record<string, unknown>) | null;
  order: ({ id: string; orderNumber: string } & Record<string, unknown>) | null;
  customer: (CustomerSummary & Record<string, unknown>) | null;
};
