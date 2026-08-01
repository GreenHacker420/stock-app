"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function NewSalePage() {
  return (
    <ModuleUnavailable
      title="New Sale Entry"
      description="Keyboard-first POS transaction entry and invoice creation."
      reason="New Sale is temporarily unavailable while its product selection, totals, stock validation and idempotency workflow are being completed."
      backHref="/sales"
      requiredPermission={PERMISSIONS.SALE_CREATE}
      plannedShortcut="F8"
    />
  );
}
