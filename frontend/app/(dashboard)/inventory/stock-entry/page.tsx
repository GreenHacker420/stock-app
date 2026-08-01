"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function StockEntryPage() {
  return (
    <ModuleUnavailable
      title="Stock Entry & Purchase Inward"
      description="Record inward inventory stock entry and purchase cost updates."
      reason="Stock Entry is temporarily unavailable while purchase price calculation, batch ledger recording, and approval request workflows are being completed."
      backHref="/inventory"
      requiredPermission={PERMISSIONS.STOCK_CREATE_MOVEMENT}
      plannedShortcut="F9"
    />
  );
}
