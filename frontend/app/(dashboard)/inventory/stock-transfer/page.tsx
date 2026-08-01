"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function StockTransferPage() {
  return (
    <ModuleUnavailable
      title="Stock Transfer Between Outlets"
      description="Inter-outlet stock transfer, transit tracking, and branch dispatch."
      reason="Stock Transfer is temporarily unavailable while multi-outlet transit validation and receiving store confirmation workflows are being completed."
      backHref="/inventory"
      requiredPermission={PERMISSIONS.STOCK_CREATE_MOVEMENT}
      plannedShortcut="Alt+F9"
    />
  );
}
