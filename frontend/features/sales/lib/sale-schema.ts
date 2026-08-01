import { z } from "zod";
import { getTodayIST } from "./sale-money";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE"] as const;

// ─── Payment schema ─────────────────────────────────────────────────────────

export const salePaymentSchema = z.object({
  _paymentId: z.string().min(1),
  paymentMode: z.enum(PAYMENT_MODES),
  amount: z.number().nonnegative("Amount must be non-negative"),
  paymentDate: z
    .string()
    .regex(DATE_REGEX, "Date must be YYYY-MM-DD")
    .default(() => getTodayIST()),
  referenceNumber: z.string().default(""),
  notes: z.string().default(""),
});

// ─── Line schema ─────────────────────────────────────────────────────────────

export const saleLineSchema = z.object({
  _lineId: z.string().min(1),
  itemId: z.string().min(1, "Item is required"),
  itemName: z.string().min(1),
  sku: z.string().default(""),
  unit: z.string().default(""),
  availableStock: z.number().nullable(),
  requiresSerialNumber: z.boolean().default(false),
  defaultSellingPrice: z.number().default(0),
  minimumAllowedPrice: z.number().nullable(),
  quantity: z.number().positive("Quantity must be greater than 0"),
  rate: z.number().nonnegative("Rate must be non-negative"),
  discountAmount: z.number().nonnegative("Discount must be non-negative").default(0),
  serialNumbers: z.array(z.string().trim().min(1, "Serial number cannot be blank")),
  description: z.string().default(""),
}).superRefine((line, ctx) => {
  if (line.requiresSerialNumber && line.serialNumbers.length !== line.quantity) {
    ctx.addIssue({
      code: "custom",
      path: ["serialNumbers"],
      message: `Product requires exactly ${line.quantity} serial number(s). ${line.serialNumbers.length} provided.`,
    });
  }
  // Unique serial numbers within line
  const set = new Set(line.serialNumbers);
  if (set.size !== line.serialNumbers.length) {
    ctx.addIssue({
      code: "custom",
      path: ["serialNumbers"],
      message: "Duplicate serial numbers within the same line are not allowed.",
    });
  }
});

// ─── Main form schema ─────────────────────────────────────────────────────────

export const saleFormSchema = z
  .object({
    shopId: z.string().min(1, "Active shop is required"),
    customerMode: z.enum(["existing", "walkin", "capture"]),
    customerId: z.string().default(""),
    customerName: z.string().default(""),
    customerPhone: z.string().default(""),
    customerEmail: z.string().default(""),
    isWalkin: z.boolean().default(false),
    saleDate: z
      .string()
      .regex(DATE_REGEX, "Date must be YYYY-MM-DD")
      .default(() => getTodayIST()),
    gstRequired: z.boolean().default(false),
    notes: z.string().default(""),
    lines: z.array(saleLineSchema).min(1, "At least one product is required"),
    payments: z.array(salePaymentSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // Validate customer mode
    if (data.customerMode === "existing" && !data.customerId) {
      ctx.addIssue({
        code: "custom",
        path: ["customerId"],
        message: "Please select a customer",
      });
    }

    // Walk-in must be fully paid
    if (data.isWalkin || data.customerMode === "walkin") {
      const totalAmount = data.lines.reduce((sum, line) => {
        const lineTotal = Math.max(0, (line.rate * line.quantity) - line.discountAmount);
        return sum + lineTotal;
      }, 0);
      const totalPaid = data.payments.reduce((sum, p) => sum + p.amount, 0);
      if (totalPaid < totalAmount - 0.005) {
        ctx.addIssue({
          code: "custom",
          path: ["payments"],
          message: "Walk-in sale must be fully paid before submission.",
        });
      }
    }

    // No future sale date
    if (data.saleDate > getTodayIST()) {
      ctx.addIssue({
        code: "custom",
        path: ["saleDate"],
        message: "Sale date cannot be in the future.",
      });
    }
  });

export type SaleFormSchema = z.infer<typeof saleFormSchema>;
