"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function NewDeliveryMemoPage() {
  return (
    <ModuleUnavailable
      title="New Delivery Memo"
      description="Issue goods dispatch challan and credit delivery memo."
      reason="New Delivery Memo is temporarily unavailable while item serial allocation, credit limit check, and dispatch ledger workflows are being completed."
      backHref="/delivery-memos"
      requiredPermission={PERMISSIONS.DM_CREATE}
      plannedShortcut="Alt+F8"
    />
  );
}
