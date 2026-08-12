import { apiRequest } from "@/lib/api/client";
import type { SaleDetail } from "@/features/sales/lib/sale-detail-types";

export async function fetchSaleDetail(token: string, saleId: string): Promise<SaleDetail> {
  return apiRequest<SaleDetail>(`/sales/${saleId}`, { token });
}

export async function sendSaleWhatsAppReceipt(token: string, saleId: string) {
  return apiRequest(`/sales/${saleId}/whatsapp-send`, { method: "POST", token });
}
