export type SaleMode = "REGULAR" | "WALK_IN";
export type PaymentMode = "CASH" | "UPI" | "BANK_TRANSFER";

export type CustomerSummary = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
};

export type SaleCustomer =
  | { kind: "EXISTING"; customer: CustomerSummary }
  | { kind: "QUICK_WALK_IN"; name?: string; phone?: string }
  | { kind: "ANONYMOUS" };

export type ItemSnapshot = {
  id: string;
  name: string;
  sku?: string | null;
  unit: string;
  availableStock: number;
  defaultRateMinor: number;
  minimumRateMinor: number;
  requiresSerialNumber: boolean;
};

export type SaleLine = {
  item: ItemSnapshot;
  quantity: number;
  rateMinor: number;
  serialNumbers: string[];
};

export type SettlementDraft =
  | { kind: "UNSETTLED" }
  | { kind: "FULL_PAYMENT"; mode: PaymentMode; paidMinor: number; changeMinor: number }
  | { kind: "PARTIAL_CREDIT"; upfrontMode: PaymentMode; paidMinor: number; creditMinor: number }
  | { kind: "FULL_CREDIT"; paidMinor: 0; creditMinor: number }
  | { kind: "WALK_IN_UPI"; paidMinor: number; confirmedFingerprint: string | null };

export type CreditAuthorization = {
  signatureBase64: string;
  customerId: string;
  transactionFingerprint: string;
  totalMinor: number;
  paidMinor: number;
  creditMinor: number;
  capturedAt: string;
};

export type SaleDraft = {
  mode: SaleMode;
  shopId: string;
  customer: SaleCustomer;
  lines: Record<string, SaleLine>;
  notes: string;
  gstRequired: boolean;
  settlement: SettlementDraft;
  creditAuthorization: CreditAuthorization | null;
};

export type SalePolicy = {
  mode: SaleMode;
  customerRequired: boolean;
  allowAnonymousCustomer: boolean;
  allowQuickCustomer: boolean;
  allowGst: boolean;
  allowCredit: boolean;
  requireSignatureForCredit: boolean;
  paymentModes: PaymentMode[];
  showDynamicUpiQr: boolean;
  allowPrint: boolean;
};

export const regularSalePolicy: SalePolicy = {
  mode: "REGULAR",
  customerRequired: true,
  allowAnonymousCustomer: false,
  allowQuickCustomer: false,
  allowGst: true,
  allowCredit: true,
  requireSignatureForCredit: true,
  paymentModes: ["CASH", "UPI", "BANK_TRANSFER"],
  showDynamicUpiQr: true,
  allowPrint: false,
};

export const walkInSalePolicy: SalePolicy = {
  mode: "WALK_IN",
  customerRequired: false,
  allowAnonymousCustomer: true,
  allowQuickCustomer: true,
  allowGst: false,
  allowCredit: false,
  requireSignatureForCredit: false,
  paymentModes: ["CASH", "UPI"],
  showDynamicUpiQr: true,
  allowPrint: true,
};

