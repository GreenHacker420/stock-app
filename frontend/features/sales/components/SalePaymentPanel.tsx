"use client";

import { useFormContext, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeSaleTotals, computeTotalPayments, computeBalance, formatINR, getTodayIST } from "../lib/sale-money";
import { Plus, Trash2, CreditCard, Banknote, QrCode, Building, FileCheck } from "lucide-react";
import type { SaleFormSchema } from "../lib/sale-schema";
import type { PaymentMode, SalePaymentFormValue } from "../lib/sale-types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const MODE_ICONS: Record<PaymentMode, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  UPI: QrCode,
  CARD: CreditCard,
  BANK_TRANSFER: Building,
  CHEQUE: FileCheck,
};

export function SalePaymentPanel() {
  const { control, watch, formState: { errors } } = useFormContext<SaleFormSchema>();
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: "payments",
    keyName: "_fieldKey",
  });

  const lines = watch("lines") || [];
  const payments = watch("payments") || [];
  const isWalkin = watch("isWalkin");

  const { totalAmount } = computeSaleTotals(lines);
  const totalPayments = computeTotalPayments(payments);
  const balance = computeBalance(totalAmount, totalPayments);

  const handleAddPayment = () => {
    const suggestedAmount = balance > 0 ? balance : 0;
    const newPayment: SalePaymentFormValue = {
      _paymentId: generateId(),
      paymentMode: "CASH",
      amount: suggestedAmount,
      paymentDate: getTodayIST(),
      referenceNumber: "",
      notes: "",
    };
    append(newPayment);
  };

  const handleAutoFillFullPayment = () => {
    if (totalAmount <= 0) return;
    const fullPayment: SalePaymentFormValue = {
      _paymentId: generateId(),
      paymentMode: "CASH",
      amount: totalAmount,
      paymentDate: getTodayIST(),
      referenceNumber: "",
      notes: "",
    };
    while (fields.length > 0) remove(0);
    append(fullPayment);
  };

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Payments / Collection
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Add full or split payments. Walk-in sales require full payment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {totalAmount > 0 && fields.length === 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoFillFullPayment}
              className="h-7 text-xs font-bold border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              Full Cash Pay ({formatINR(totalAmount)})
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddPayment}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Payment
          </Button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="text-center py-4 border border-dashed rounded-md text-xs text-muted-foreground">
          No payments added. {isWalkin ? "Walk-in requires payment." : "Sale will be recorded as credit (UNPAID)."}
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => {
            const currentPayment = watch(`payments.${index}`) as SalePaymentFormValue;
            if (!currentPayment) return null;
            const IconComp = MODE_ICONS[currentPayment.paymentMode] ?? CreditCard;

            return (
              <div
                key={field._fieldKey || field._paymentId}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-2.5 border rounded-md bg-muted/20 text-xs"
              >
                {/* Payment Mode */}
                <div className="sm:col-span-3">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Mode</label>
                  <Select
                    value={currentPayment.paymentMode}
                    onValueChange={(val) => {
                      if (val) {
                        update(index, { ...currentPayment, paymentMode: val as PaymentMode });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <div className="flex items-center gap-1.5">
                        <IconComp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="UPI">UPI / QR</SelectItem>
                      <SelectItem value="CARD">Card (POS)</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div className="sm:col-span-3">
                  <label className="text-[10px] text-muted-foreground mb-1 block">Amount (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentPayment.amount || ""}
                    onChange={(e) =>
                      update(index, {
                        ...currentPayment,
                        amount: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="h-8 text-xs font-mono font-bold text-right"
                  />
                </div>

                {/* Reference Number */}
                <div className="sm:col-span-4">
                  <label className="text-[10px] text-muted-foreground mb-1 block">
                    Ref # / UTR (Optional)
                  </label>
                  <Input
                    value={currentPayment.referenceNumber || ""}
                    onChange={(e) =>
                      update(index, { ...currentPayment, referenceNumber: e.target.value })
                    }
                    placeholder="Transaction ID / Cheque #"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Remove Button */}
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove payment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RHF error for payment array */}
      {errors.payments?.message && (
        <p className="text-xs text-destructive font-bold">{errors.payments.message}</p>
      )}
    </div>
  );
}
