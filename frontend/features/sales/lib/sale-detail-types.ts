import type { Item, Customer } from "@/lib/api/client";

export type SaleDetailPayment = {
  id: string;
  paymentMode: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CHEQUE";
  amount: number | string;
  status: "RECORDED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  receivedAt: string;
  referenceNumber: string | null;
  notes: string | null;
  details: Record<string, unknown> | null;
  receivedBy: { id: string; name: string };
  verifiedBy: { id: string; name: string } | null;
};

export type SaleDetailItem = {
  id: string;
  itemId: string;
  quantity: number | string;
  rate: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  serialNumbers: string[] | null;
  description: string | null;
  item: Item;
};

export type SaleDetail = {
  id: string;
  saleNumber: string;
  shopId: string;
  staffId: string;
  customerId: string;
  isWalkin: boolean;
  gstRequired: boolean;
  gstInvoiceStatus: string;
  gstInvoiceNumber: string | null;
  gstInvoiceGeneratedAt: string | null;
  subtotal: number | string;
  discountAmount: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
  verifiedPaidAmount: number | string;
  recordedPaymentAmount: number | string;
  paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  saleStatus: "DRAFT" | "CONFIRMED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "RETURNED";
  receivableOrigin?: string | null;
  customerSignature: string | null;
  saleDate: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  customer: Customer;
  items: SaleDetailItem[];
  payments: SaleDetailPayment[];
  staff: { id: string; name: string; role: string };
};
