import type { SaleFormSchema } from "./sale-schema";
import type { CreateSalePayload } from "./sale-types";

export function buildSalePayload(form: SaleFormSchema): CreateSalePayload {
  const payload: CreateSalePayload = {
    shopId: form.shopId,
    saleDate: form.saleDate,
    gstRequired: form.gstRequired || undefined,
    notes: form.notes || undefined,

    items: form.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      rate: line.rate,
      discountAmount: line.discountAmount > 0 ? line.discountAmount : undefined,
      serialNumbers: line.requiresSerialNumber && line.serialNumbers.length > 0
        ? line.serialNumbers
        : undefined,
      description: line.description || undefined,
    })),

    payments:
      form.payments.length > 0
        ? form.payments.map((p) => ({
            paymentMode: p.paymentMode,
            amount: p.amount,
            paymentDate: p.paymentDate || undefined,
            referenceNumber: p.referenceNumber || undefined,
            notes: p.notes || undefined,
          }))
        : undefined,
  };

  // Customer mode
  if (form.customerMode === "walkin" || form.isWalkin) {
    payload.isWalkin = true;
  } else if (form.customerMode === "existing" && form.customerId) {
    payload.customerId = form.customerId;
  } else if (form.customerMode === "capture") {
    const customerInfo: { name?: string; phone?: string; email?: string } = {};
    if (form.customerName) customerInfo.name = form.customerName;
    if (form.customerPhone) customerInfo.phone = form.customerPhone;
    if (form.customerEmail) customerInfo.email = form.customerEmail;
    if (Object.keys(customerInfo).length > 0) {
      payload.customerInfo = customerInfo;
    }
  }

  return payload;
}
