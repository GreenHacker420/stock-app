import type { PaymentMode } from "@/features/registers/lib/register-types";

export type TransactionLine = {
  key: string;
  itemId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  rate: number;
  availableStock: number | null;
  minimumAllowedPrice: number | null;
  requiresSerialNumber: boolean;
  serialNumbers: string[];
  description: string;
};

export type OrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type CreateOrderPayload = {
  shopId: string;
  customerId: string;
  assignedStaffId?: string;
  expectedDispatchDate?: string;
  priority?: OrderPriority;
  ownerNotes?: string;
  items: Array<{
    itemId: string;
    quantityOrdered: number;
    rate: number;
    discountAmount?: number;
  }>;
};

export type CreatedOrder = {
  id: string;
  orderNumber: string;
  shopId: string;
  customerId: string;
  status: string;
  totalAmount: number | string;
};

export type PaymentPayload = {
  shopId: string;
  saleId?: string;
  dmId?: string;
  orderId?: string;
  customerId?: string;
  paymentMode: PaymentMode;
  amount: number;
  paymentDate?: string;
  referenceNumber?: string;
  proofImageUrl?: string;
  notes?: string;
  details?: Record<string, unknown>;
};

export type CreatedPayment = {
  id: string;
  shopId: string;
  customerId: string | null;
  saleId: string | null;
  dmId: string | null;
  orderId: string | null;
  paymentMode: PaymentMode;
  amount: number | string;
  status: string;
};

export type DeliveryMemoPayload = {
  shopId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  expectedPaymentDate?: string;
  documentPurpose?: "CREDIT_DELIVERY";
  deliveryNotes?: string;
  items: Array<{
    itemId: string;
    quantity: number;
    rate: number;
    discountAmount?: number;
    serialNumbers?: string[];
    description?: string;
  }>;
};

export type DeliveryMemoDraft = {
  id: string;
  dmNumber: string;
  shopId: string;
  customerId: string;
  lifecycleStatus: string;
  version: number;
  estimatedAmount: number | string;
  expectedPaymentDate?: string | null;
  deliveryNotes?: string | null;
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    type?: "REGULAR" | "BUSINESS" | "WALK_IN";
  };
  items: Array<{
    id: string;
    itemId: string;
    quantity: number | string;
    rate: number | string;
    serialNumbers?: string[] | null;
    description?: string | null;
    item: {
      id: string;
      name: string;
      sku?: string | null;
      unit: string;
      availableStock?: number | string;
      minimumAllowedPrice?: number | string | null;
      requiresSerialNumber?: boolean;
    };
  }>;
};
