"use client";

import { ModuleUnavailable } from "@/components/feedback/ModuleUnavailable";
import { PERMISSIONS } from "@/lib/permissions/permissions";

export default function ReceivePaymentPage() {
  return (
    <ModuleUnavailable
      title="Receive Payment"
      description="Record customer collection, cash/UPI/cheque receipt, and bill allocation."
      reason="Receive Payment is temporarily unavailable while collection bill matching, cheque details verification, and customer ledger posting workflows are being completed."
      backHref="/payments"
      requiredPermission={PERMISSIONS.PAYMENT_CREATE}
      plannedShortcut="F6"
    />
  );
}
