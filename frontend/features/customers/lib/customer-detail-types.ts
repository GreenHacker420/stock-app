import type { CustomerRegisterRow } from "@/features/registers/lib/register-types";

export type CustomerDetail = CustomerRegisterRow & {
  activitySummary: {
    totalSales: number;
    totalPayments: number;
    totalOrders: number;
    totalDMs: number;
    totalCollections: number;
    lastPurchaseDate: string | null;
    averageOrderValue: number;
  };
};

export type CustomerLedgerEntry = {
  id: string;
  shopId: string;
  customerId: string;
  sourceType: string;
  sourceId: string;
  entryType: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  createdById: string;
  reversalOfId?: string | null;
  idempotencyKey?: string | null;
  clientMutationId?: string | null;
  reversalReason?: string | null;
  notes?: string | null;
  effectiveAt: string;
  createdAt: string;
  updatedAt?: string;
  runningBalance: number;
  isReversal: boolean;
  isReversed: boolean;
  reversalEntryId?: string | null;
  attachments?: Array<{
    id: string;
    assetId: string;
    purpose: string;
    sortOrder: number;
    createdAt: string;
    asset?: {
      id: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      url?: string;
    };
  }>;
};

export type CustomerLedgerPage = {
  entries: CustomerLedgerEntry[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CustomerLedgerSummary = {
  customerId?: string;
  from?: string | null;
  to?: string | null;
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  outstandingAmount: number;
  advanceBalance: number;
};
