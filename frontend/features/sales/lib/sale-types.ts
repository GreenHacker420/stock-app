import type { Customer, Item } from "@/lib/api/client";

// ─── Payment ───────────────────────────────────────────────────────────────

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";

export interface SalePaymentPayload {
  paymentMode: PaymentMode;
  amount: number;
  paymentDate?: string; // "YYYY-MM-DD"
  referenceNumber?: string;
  proofImageUrl?: string;
  notes?: string;
  details?: Record<string, unknown>;
}

// ─── Sale Item ─────────────────────────────────────────────────────────────

export interface SaleItemPayload {
  itemId: string;
  quantity: number;
  rate: number;
  discountAmount?: number;
  serialNumbers?: string[];
  description?: string;
}

// ─── Customer Modes ────────────────────────────────────────────────────────

/** The three mutually exclusive customer selection modes */
export type CustomerMode = "existing" | "walkin" | "capture";

export interface CapturedCustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
}

// ─── POST /sales request ───────────────────────────────────────────────────

export interface CreateSalePayload {
  shopId: string;
  customerId?: string;
  customerInfo?: CapturedCustomerInfo;
  isWalkin?: boolean;
  saleDate?: string; // "YYYY-MM-DD"
  dueDate?: string;
  items: SaleItemPayload[];
  payments?: SalePaymentPayload[];
  customerSignature?: string;
  gstRequired?: boolean;
  notes?: string;
}

// ─── POST /sales response ──────────────────────────────────────────────────

export interface SaleItemResponse {
  id: string;
  itemId: string;
  quantity: string | number;
  rate: string | number;
  discountAmount: string | number;
  totalAmount: string | number;
  serialNumbers: string[] | null;
  description: string | null;
  item: Item;
}

export interface SalePaymentResponse {
  id: string;
  paymentMode: PaymentMode;
  amount: string | number;
  paymentStatus: "RECORDED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  paymentDate: string | null;
  referenceNumber: string | null;
  notes: string | null;
}

export interface CreatedSale {
  id: string;
  saleNumber: string;
  shopId: string;
  staffId: string;
  customerId: string;
  isWalkin: boolean;
  gstRequired: boolean;
  gstInvoiceStatus: string;
  subtotal: string | number;
  discountAmount: string | number;
  totalAmount: string | number;
  paidAmount: string | number;
  balanceAmount: string | number;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  saleStatus: "CONFIRMED" | "PAID";
  customerSignature: string | null;
  saleDate: string;
  createdAt: string;
  customer: Customer;
  items: SaleItemResponse[];
  payments: SalePaymentResponse[];
  staff: { id: string; name: string; role: string };
}

// ─── Form values (React Hook Form) ─────────────────────────────────────────

export interface SaleLineFormValue {
  /** Unique key for the line (not sent to backend) */
  _lineId: string;
  itemId: string;
  itemName: string;
  sku: string;
  unit: string;
  availableStock: number | null;
  requiresSerialNumber: boolean;
  defaultSellingPrice: number;
  minimumAllowedPrice: number | null;
  quantity: number;
  rate: number;
  discountAmount: number;
  serialNumbers: string[];
  description: string;
}

export interface SalePaymentFormValue {
  _paymentId: string;
  paymentMode: PaymentMode;
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  notes: string;
}

export interface SaleFormValues {
  shopId: string;
  customerMode: CustomerMode;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  isWalkin: boolean;
  saleDate: string;
  gstRequired: boolean;
  notes: string;
  lines: SaleLineFormValue[];
  payments: SalePaymentFormValue[];
}

// ─── Item with stock (search result) ───────────────────────────────────────

export interface ItemWithStock extends Item {
  requiresSerialNumber?: boolean;
}

// ─── Customer search result ────────────────────────────────────────────────

export interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string | null;
  type: "REGULAR" | "WALK_IN" | "BUSINESS";
  outstandingAmount: string | null;
  status: "ACTIVE" | "INACTIVE";
}

// ─── Item stock result ─────────────────────────────────────────────────────

export interface ItemStockResult {
  itemId: string;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
}

// ─── Rate suggestion result ────────────────────────────────────────────────

export interface RateSuggestion {
  suggestedRate: number | null;
  lastRate: number | null;
  defaultSellingPrice: number;
}
