"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function NewOrderPage() {
  return (
    <ModuleUnavailable
      title="New Customer Order"
      description="Customer order booking and item fulfillment setup."
      reason="New Order creation is temporarily unavailable while product item booking, deposit tracking, and stock reservation workflows are being completed."
      backHref="/orders"
      requiredPermission={PERMISSIONS.ORDER_CREATE}
      plannedShortcut="Ctrl+F8"
    />
  );
}
