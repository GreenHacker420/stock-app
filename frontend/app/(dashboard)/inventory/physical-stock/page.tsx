"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function PhysicalStockPage() {
  return (
    <ModuleUnavailable
      title="Physical Stock Verification"
      description="Stock audit count reconciliation and physical inventory adjustment."
      reason="Physical Stock Verification is temporarily unavailable while ledger audit reconciliation, variance calculation, and adjustment approval workflows are being completed."
      backHref="/inventory"
      requiredPermission={PERMISSIONS.STOCK_VIEW}
      plannedShortcut="Ctrl+F7"
    />
  );
}
