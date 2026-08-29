"use client";

import { useState, type ComponentType } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Banknote, Building, CreditCard, FileCheck, Landmark, Plus, QrCode, Trash2, Wallet } from "lucide-react";

import { focusRegistry } from "@/components/keyboard/focus-registry";
import { RovingFocusZone } from "@/components/keyboard/RovingFocusZone";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeBalance, computeSaleTotals, computeTotalPayments, formatINR, getTodayIST } from "../lib/sale-money";
import type { SaleFormSchema } from "../lib/sale-schema";
import type { PaymentMode, SalePaymentFormValue } from "../lib/sale-types";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const MODE_ICONS: Record<PaymentMode, ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  UPI: QrCode,
  CARD: CreditCard,
  BANK_TRANSFER: Building,
  CHEQUE: FileCheck,
};

interface PaymentRowProps {
  payment: SalePaymentFormValue;
  index: number;
  onUpdate: (payment: SalePaymentFormValue) => void;
  onRemove: () => void;
}

function PaymentRow({ payment, index, onUpdate, onRemove }: PaymentRowProps) {
  const [modeOpen, setModeOpen] = useState(false);
  const modeFieldId = `sale.payments.${payment._paymentId}.paymentMode`;
  const amountFieldId = `sale.payments.${payment._paymentId}.amount`;
  const referenceFieldId = `sale.payments.${payment._paymentId}.reference`;

  const { setRef: setModeRef, onFocus: onModeFocus, isActive: isModeActive } = useTransactionField<HTMLButtonElement>({
    id: modeFieldId,
    zoneId: "PAYMENT_GRID",
    rowIndex: index,
    colIndex: 0,
    columnId: "paymentMode",
  });
  const { setRef: setAmountRef, onFocus: onAmountFocus, isActive: isAmountActive } = useTransactionField<HTMLInputElement>({
    id: amountFieldId,
    zoneId: "PAYMENT_GRID",
    rowIndex: index,
    colIndex: 1,
    columnId: "amount",
  });
  const { setRef: setReferenceRef, onFocus: onReferenceFocus, isActive: isReferenceActive } = useTransactionField<HTMLInputElement>({
    id: referenceFieldId,
    zoneId: "PAYMENT_GRID",
    rowIndex: index,
    colIndex: 2,
    columnId: "reference",
  });

  const Icon = MODE_ICONS[payment.paymentMode] ?? CreditCard;
  const updateEditable = (next: SalePaymentFormValue) => {
    focusRegistry.setMode("EDITING");
    onUpdate(next);
  };

  return (
    <div role="row" aria-rowindex={index + 1} className="grid grid-cols-1 items-end gap-2 rounded-md border bg-muted/20 p-2.5 text-xs sm:grid-cols-12">
      <div role="gridcell" className="sm:col-span-3">
        <label className="mb-1 block text-[10px] text-muted-foreground">Mode</label>
        <Select
          open={modeOpen}
          onOpenChange={(open) => {
            setModeOpen(open);
            focusRegistry.setMode(open ? "COMBOBOX" : "NAVIGATION");
            if (!open) requestAnimationFrame(() => focusRegistry.setActiveField(modeFieldId, "PAYMENT_GRID"));
          }}
          value={payment.paymentMode}
          onValueChange={(value) => {
            if (value) onUpdate({ ...payment, paymentMode: value as PaymentMode });
          }}
        >
          <SelectTrigger ref={setModeRef} tabIndex={isModeActive ? 0 : -1} onFocus={onModeFocus} className={`h-8 w-full text-xs ${isModeActive ? "border-primary ring-2 ring-primary" : ""}`} aria-label={`Payment mode for payment ${index + 1}`}>
            <div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><SelectValue /></div>
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

      <div role="gridcell" className="sm:col-span-3">
        <label className="mb-1 block text-[10px] text-muted-foreground">Amount (₹)</label>
        <Input ref={setAmountRef} type="number" min="0" step="0.01" tabIndex={isAmountActive ? 0 : -1} value={payment.amount || ""} onFocus={onAmountFocus} onChange={(event) => updateEditable({ ...payment, amount: Math.max(0, parseFloat(event.target.value) || 0) })} className={`h-8 text-right font-mono text-xs font-bold ${isAmountActive ? "border-primary ring-2 ring-primary" : ""}`} aria-label={`Payment amount for payment ${index + 1}`} />
      </div>

      <div role="gridcell" className="sm:col-span-4">
        <label className="mb-1 block text-[10px] text-muted-foreground">Ref # / UTR (Optional)</label>
        <Input ref={setReferenceRef} tabIndex={isReferenceActive ? 0 : -1} value={payment.referenceNumber || ""} onFocus={onReferenceFocus} onChange={(event) => updateEditable({ ...payment, referenceNumber: event.target.value })} placeholder="Transaction ID / Cheque #" className={`h-8 text-xs ${isReferenceActive ? "border-primary ring-2 ring-primary" : ""}`} aria-label={`Payment reference for payment ${index + 1}`} />
      </div>

      <div role="gridcell" className="flex justify-end sm:col-span-2">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove payment ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export function SalePaymentPanel() {
  const { control, watch, setValue, formState: { errors } } = useFormContext<SaleFormSchema>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: "payments", keyName: "_fieldKey" });

  const lines = watch("lines") || [];
  const payments = watch("payments") || [];
  const isWalkin = watch("isWalkin");
  const customerName = watch("customerName");

  const { totalAmount } = computeSaleTotals(lines);
  const totalPayments = computeTotalPayments(payments);
  const balance = computeBalance(totalAmount, totalPayments);

  const updatePayment = (index: number, payment: SalePaymentFormValue) => {
    setValue(`payments.${index}`, payment, { shouldDirty: true, shouldTouch: true });
  };

  const focusPayment = (paymentId: string, column: "paymentMode" | "amount" | "reference" = "amount") => {
    requestAnimationFrame(() => focusRegistry.setActiveField(`sale.payments.${paymentId}.${column}`, "PAYMENT_GRID"));
  };

  const handleAddPayment = () => {
    const newPayment: SalePaymentFormValue = { _paymentId: generateId(), paymentMode: "CASH", amount: balance > 0 ? balance : 0, paymentDate: getTodayIST(), referenceNumber: "", notes: "" };
    append(newPayment);
    focusPayment(newPayment._paymentId);
  };

  const handleAutoFillFullCash = () => {
    if (totalAmount <= 0) return;
    const fullPayment: SalePaymentFormValue = { _paymentId: generateId(), paymentMode: "CASH", amount: totalAmount, paymentDate: getTodayIST(), referenceNumber: "", notes: "" };
    replace([fullPayment]);
    focusPayment(fullPayment._paymentId);
  };

  const handleSetFullCredit = () => {
    replace([]);
  };

  const handleRemove = (index: number) => {
    const currentPayments = watch("payments") || [];
    const remaining = currentPayments.filter((_, paymentIndex) => paymentIndex !== index);
    remove(index);
    const next = remaining[Math.min(index, Math.max(remaining.length - 1, 0))];
    if (next) focusPayment(next._paymentId);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payments & Collection</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isWalkin ? "Walk-in customers require full cash/digital payment." : "Credit sales (Udhar) leave payments blank or partial."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {totalAmount > 0 ? (
            <>
              {!isWalkin && fields.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSetFullCredit}
                  className="h-7 border-amber-300 bg-amber-50/60 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <Landmark className="mr-1 size-3.5" />
                  Full Credit / Udhar (₹{totalAmount.toLocaleString("en-IN")})
                </Button>
              ) : null}

              {fields.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoFillFullCash}
                  className="h-7 border-emerald-300 bg-emerald-50/60 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  <Banknote className="mr-1 size-3.5" />
                  Full Cash Pay ({formatINR(totalAmount)})
                </Button>
              ) : null}
            </>
          ) : null}

          <Button type="button" variant="outline" size="sm" onClick={handleAddPayment} className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" />
            Add Payment
          </Button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-amber-300/70 bg-amber-50/30 p-4 text-center dark:border-amber-900/50 dark:bg-amber-950/10">
          <Badge variant="outline" className="border-amber-400 bg-amber-100/70 font-mono text-[11px] font-bold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Wallet className="mr-1 size-3 text-amber-600" />
            CREDIT / UDHAR SALE
          </Badge>
          <p className="mt-1.5 text-xs font-medium text-slate-800 dark:text-slate-200">
            No upfront payment added. {totalAmount > 0 ? `Total ${formatINR(totalAmount)}` : "Sale amount"} will be recorded as <strong>CREDIT (UNPAID)</strong>
            {customerName ? ` under customer ledger: "${customerName}"` : ""}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <RovingFocusZone zoneId="PAYMENT_GRID">
            <div className="space-y-2" role="grid" aria-label="Sale payment entries">
              {fields.map((field, index) => {
                const currentPayment = watch(`payments.${index}`) as SalePaymentFormValue;
                if (!currentPayment) return null;
                return <PaymentRow key={field._fieldKey || field._paymentId} payment={currentPayment} index={index} onUpdate={(payment) => updatePayment(index, payment)} onRemove={() => handleRemove(index)} />;
              })}
            </div>
          </RovingFocusZone>

          {balance > 0 && !isWalkin ? (
            <div className="flex items-center justify-between rounded-md border border-amber-300/80 bg-amber-50/50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="flex items-center gap-1.5">
                <Landmark className="size-3.5 text-amber-600" />
                <span>Remaining Balance recorded as Credit (Udhar):</span>
              </span>
              <span className="font-mono font-black">{formatINR(balance)}</span>
            </div>
          ) : null}
        </div>
      )}

      {errors.payments?.message ? <p className="text-xs font-bold text-destructive">{errors.payments.message}</p> : null}
    </div>
  );
}
