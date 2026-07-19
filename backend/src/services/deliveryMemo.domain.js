const RECEIVABLE_PURPOSES = new Set(["CREDIT_DELIVERY", "SUPPLY_PENDING_INVOICE"]);

export function legacyDeliveryMemoStatusForPayment(paymentStatus) {
  if (paymentStatus === "PAID") return "FULLY_PAID";
  if (paymentStatus === "PARTIALLY_PAID") return "PARTIALLY_PAID";
  return "CREATED";
}

export function deriveDeliveryMemoDueStatus(dm, now = new Date()) {
  if (Number(dm.balanceAmount) <= 0) return "SETTLED";
  if (!dm.expectedPaymentDate) return "NOT_DUE";
  const due = new Date(dm.expectedPaymentDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay.getTime() === today.getTime()) return "DUE_TODAY";
  return dueDay < today ? "OVERDUE" : "NOT_DUE";
}

export function withDerivedMemoState(dm, user) {
  const isOwner = user.role === "OWNER";
  const isDraft = dm.lifecycleStatus === "DRAFT" || dm.lifecycleStatus === "READY_TO_DISPATCH";
  const isDispatched = dm.lifecycleStatus === "DISPATCHED";
  const hasBalance = Number(dm.balanceAmount) > 0;
  const hasReturns = dm.returnStatus !== "NO_RETURN";
  const hasInvoice = dm.invoicingStatus !== "NOT_INVOICED" || (dm.sales?.length || 0) > 0;
  return {
    ...dm,
    dueStatus: deriveDeliveryMemoDueStatus(dm),
    allowedActions: {
      canEditDraft: isDraft && (isOwner || dm.staffId === user.id),
      canPost: isDraft && (isOwner || dm.staffId === user.id),
      canCollectPayment: isDispatched && hasBalance,
      canRequestReturn: isDispatched && dm.returnStatus !== "FULLY_RETURNED",
      canRequestCancellation: isDispatched && !hasInvoice,
      canConvertToSale: isDispatched && !hasInvoice && !hasReturns && RECEIVABLE_PURPOSES.has(dm.documentPurpose),
      canPrint: !isDraft,
      canShare: !isDraft,
    },
  };
}

export function purposeCreatesReceivable(purpose) {
  return RECEIVABLE_PURPOSES.has(purpose);
}
