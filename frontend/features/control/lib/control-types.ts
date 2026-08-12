export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ApprovalRequestRow = {
  id: string;
  shopId: string;
  type: string;
  entityType: string;
  entityId: string;
  payloadJson: Record<string, unknown> | null;
  reason: string | null;
  requestedById: string;
  status: ApprovalStatus;
  approvedById: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
  requestedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
};

export type CorrectionRequestRow = {
  id: string;
  entityType: string;
  entityId: string;
  requestedChangeJson: Record<string, unknown>;
  reason: string | null;
  status: ApprovalStatus;
  createdAt: string;
};

export type CashSessionStatus = "OPEN" | "CLOSED" | "REVIEWED" | "LOCKED";

export type CashSessionRow = {
  id: string;
  shopId: string;
  staffId: string;
  previousSessionId: string | null;
  openingCash: number | string;
  expectedCash: number | string;
  actualCash: number | string | null;
  cashHandover: number | string | null;
  difference: number | string | null;
  differenceReason: string | null;
  status: CashSessionStatus;
  openedAt: string;
  closedAt: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  staff: { id: string; name: string; mobile: string };
};
