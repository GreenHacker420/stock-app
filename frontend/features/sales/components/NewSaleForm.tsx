"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, type SubmitHandler, useForm } from "react-hook-form";
import { Loader2, Receipt, RotateCcw, Save } from "lucide-react";

import { focusRegistry } from "@/components/keyboard/focus-registry";
import { TransactionFocusProvider } from "@/components/keyboard/TransactionFocusContext";
import { TransactionKeyboardProvider } from "@/components/keyboard/TransactionKeyboardProvider";
import { useTransactionField } from "@/components/keyboard/useTransactionField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkspacePage, WorkspacePageHeader } from "@/components/workspace/WorkspacePage";
import type { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useCreateSaleMutation } from "../api/sale.mutations";
import { createEmptyLine, getTodayIST, useNewSaleDraft } from "../hooks/useNewSaleDraft";
import { useUnsavedSaleGuard } from "../hooks/useUnsavedSaleGuard";
import { buildSalePayload } from "../lib/sale-payload";
import { saleFormSchema } from "../lib/sale-schema";
import type { SaleFormValues } from "../lib/sale-types";
import { SaleCustomerSelector } from "./SaleCustomerSelector";
import { SaleLineGrid } from "./SaleLineGrid";
import { SaleMobileActionBar } from "./SaleMobileActionBar";
import { SalePaymentPanel } from "./SalePaymentPanel";
import { SaleTotalsPanel } from "./SaleTotalsPanel";
import { SaleValidationSummary } from "./SaleValidationSummary";

export function NewSaleFormContent() {
  const router = useRouter();
  const { token, activeShopId } = useAuthStore();
  const { idempotencyKey, cycleKey } = useNewSaleDraft();
  const [serverError, setServerError] = useState<string | null>(null);

  const methods = useForm<SaleFormValues>({
    defaultValues: {
      shopId: activeShopId ?? "",
      customerMode: "existing",
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      isWalkin: false,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [createEmptyLine()],
      payments: [],
    },
  });

  const { handleSubmit, watch, reset, formState: { isDirty, errors } } = methods;
  const lines = watch("lines") || [];
  const payments = watch("payments") || [];
  const isWalkin = watch("isWalkin");

  const dateField = useTransactionField<HTMLInputElement>({ id: "sale.header.date", zoneId: "SALE_HEADER", order: 20 });
  const gstField = useTransactionField<HTMLInputElement>({ id: "sale.header.gst", zoneId: "SALE_HEADER", order: 30 });
  const notesField = useTransactionField<HTMLTextAreaElement>({ id: "sale.remarks", zoneId: "REMARKS" });
  const saveBtnField = useTransactionField<HTMLButtonElement>({ id: "sale.save", zoneId: "SAVE_BUTTON" });

  const saleDateRegistration = methods.register("saleDate");
  const notesRegistration = methods.register("notes");

  useEffect(() => {
    const frame = requestAnimationFrame(() => focusRegistry.setActiveField("sale.customer.search", "CUSTOMER_SEARCH"));
    return () => cancelAnimationFrame(frame);
  }, []);

  const { confirmNavigation } = useUnsavedSaleGuard({
    isDirty,
    isSubmitted: methods.formState.isSubmitSuccessful,
  });

  const createSaleMutation = useCreateSaleMutation({
    token,
    activeShopId,
    idempotencyKey,
    onSuccess: (sale) => {
      cycleKey();
      router.push(`/sales/${sale.id}`);
    },
    onError: (error: ApiError) => {
      setServerError(error.message || "Failed to record sale. Please review and try again.");
    },
  });

  const processSubmit: SubmitHandler<SaleFormValues> = (formData) => {
    setServerError(null);
    const validLines = (formData.lines || []).filter((line) => line.itemId && line.itemId.trim() !== "");
    const parseResult = saleFormSchema.safeParse({ ...formData, lines: validLines });
    if (!parseResult.success) {
      setServerError(parseResult.error.issues[0]?.message || "Validation failed");
      return;
    }
    createSaleMutation.mutate(buildSalePayload(parseResult.data));
  };

  const focusFirstLineCell = () => {
    const firstLine = methods.getValues("lines")[0];
    if (!firstLine) return;
    const searchId = `sale.items.${firstLine._lineId}.search`;
    const quantityId = `sale.items.${firstLine._lineId}.quantity`;
    requestAnimationFrame(() => {
      if (focusRegistry.getField(searchId)) focusRegistry.setActiveField(searchId, "LINE_ITEM_GRID");
      else focusRegistry.setActiveField(quantityId, "LINE_ITEM_GRID");
    });
  };

  const handleBack = () => {
    if (confirmNavigation()) router.push("/sales");
  };

  const handleResetForm = () => {
    if (!window.confirm("Clear all values and start a new sale draft?")) return;
    cycleKey();
    reset({
      shopId: activeShopId ?? "",
      customerMode: "existing",
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      isWalkin: false,
      saleDate: getTodayIST(),
      gstRequired: false,
      notes: "",
      lines: [createEmptyLine()],
      payments: [],
    });
    setServerError(null);
    requestAnimationFrame(() => focusRegistry.setActiveField("sale.customer.search", "CUSTOMER_SEARCH"));
  };

  const handleRemoveLine = (lineId: string) => {
    const currentLines = methods.getValues("lines");
    if (currentLines.length <= 1) return;
    const removedIndex = currentLines.findIndex((line) => line._lineId === lineId);
    if (removedIndex < 0) return;
    const remaining = currentLines.filter((line) => line._lineId !== lineId);
    methods.setValue("lines", remaining, { shouldDirty: true });
    const nextLine = remaining[Math.min(removedIndex, remaining.length - 1)];
    requestAnimationFrame(() => {
      if (!nextLine) {
        focusFirstLineCell();
        return;
      }
      const searchId = `sale.items.${nextLine._lineId}.search`;
      if (focusRegistry.getField(searchId)) focusRegistry.setActiveField(searchId, "LINE_ITEM_GRID");
      else focusRegistry.setActiveField(`sale.items.${nextLine._lineId}.quantity`, "LINE_ITEM_GRID");
    });
  };

  const handleRemovePayment = (paymentId: string) => {
    const currentPayments = methods.getValues("payments");
    const removedIndex = currentPayments.findIndex((payment) => payment._paymentId === paymentId);
    if (removedIndex < 0) return;
    const remaining = currentPayments.filter((payment) => payment._paymentId !== paymentId);
    methods.setValue("payments", remaining, { shouldDirty: true });
    const nextPayment = remaining[Math.min(removedIndex, Math.max(remaining.length - 1, 0))];
    requestAnimationFrame(() => {
      if (nextPayment) focusRegistry.setActiveField(`sale.payments.${nextPayment._paymentId}.amount`, "PAYMENT_GRID");
      else focusFirstLineCell();
    });
  };

  return (
    <TransactionKeyboardProvider
      onSave={handleSubmit(processSubmit)}
      onRemoveLine={handleRemoveLine}
      onRemovePayment={handleRemovePayment}
      onAbandonDraft={handleBack}
      mutationPending={createSaleMutation.isPending}
    >
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(processSubmit)} className="pb-[clamp(4.5rem,10vh,6.5rem)] lg:pb-[var(--workspace-gutter-y)]">
          <WorkspacePage className="gap-[clamp(0.75rem,1.1vw,1.25rem)]">
            <WorkspacePageHeader
              kicker="Transactions · Sales"
              title="New sale"
              description="Keyboard-first sale entry using real customer, item, stock and payment contracts. Server totals and stock checks remain authoritative."
              icon={Receipt}
              backHref={null}
              actions={(
                <>
                  <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={createSaleMutation.isPending} className="h-9">Back</Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleResetForm} disabled={createSaleMutation.isPending} className="h-9 gap-1.5 text-xs"><RotateCcw className="size-3.5" />Reset</Button>
                  <Button
                    ref={saveBtnField.setRef}
                    onFocus={saveBtnField.onFocus}
                    type="submit"
                    size="sm"
                    disabled={createSaleMutation.isPending || lines.length === 0}
                    className={`h-9 gap-2 px-[clamp(0.8rem,1vw,1.15rem)] text-xs font-semibold ${saveBtnField.isActive ? "border-primary ring-2 ring-primary" : ""}`}
                  >
                    {createSaleMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {createSaleMutation.isPending ? "Saving…" : "Save Sale (Ctrl+Enter)"}
                  </Button>
                </>
              )}
            />

            <SaleValidationSummary serverError={serverError} fieldErrors={errors} />

            <div className="grid min-w-0 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(21rem, 62vw, 58rem)), 1fr))", gap: "var(--workspace-gap)" }}>
              <div className="min-w-0 space-y-[var(--workspace-gap)]">
                <Card className="overflow-hidden rounded-xl shadow-none">
                  <CardContent className="space-y-[clamp(0.75rem,1.2vh,1rem)] p-[clamp(0.75rem,1vw,1rem)]">
                    <SaleCustomerSelector />
                    <div className="grid gap-[clamp(0.65rem,1vw,1rem)] border-t pt-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="sale-date" className="mb-1 block text-xs font-semibold">Sale date</label>
                        <Input
                          id="sale-date"
                          type="date"
                          max={getTodayIST()}
                          {...saleDateRegistration}
                          ref={(element) => {
                            saleDateRegistration.ref(element);
                            dateField.setRef(element);
                          }}
                          onFocus={dateField.onFocus}
                          className={`h-[var(--workspace-control-height)] text-xs ${dateField.isActive ? "border-primary ring-2 ring-primary/30" : ""}`}
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                          <input
                            ref={gstField.setRef}
                            type="checkbox"
                            checked={watch("gstRequired")}
                            onFocus={gstField.onFocus}
                            onChange={(event) => methods.setValue("gstRequired", event.target.checked, { shouldDirty: true })}
                            className={`size-4 rounded border-input accent-foreground ${gstField.isActive ? "ring-2 ring-primary ring-offset-2" : ""}`}
                          />
                          GST invoice required
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-xl shadow-none"><CardContent className="p-[clamp(0.65rem,0.9vw,0.95rem)]"><div className="workspace-kicker mb-3">Line items · {lines.length}</div><SaleLineGrid /></CardContent></Card>
                <SalePaymentPanel />
              </div>

              <aside className="grid min-w-0 gap-[var(--workspace-gap)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))] xl:sticky xl:top-[var(--workspace-gutter-y)]">
                <SaleTotalsPanel lines={lines} payments={payments} isWalkin={isWalkin} />
                <Card className="rounded-xl shadow-none">
                  <CardContent className="space-y-2 p-[clamp(0.75rem,1vw,1rem)]">
                    <label htmlFor="sale-notes" className="workspace-kicker block">Internal notes / remarks</label>
                    <textarea
                      id="sale-notes"
                      {...notesRegistration}
                      ref={(element) => {
                        notesRegistration.ref(element);
                        notesField.setRef(element);
                      }}
                      onFocus={notesField.onFocus}
                      placeholder="Optional sale notes or special instructions…"
                      className={`min-h-[clamp(5.5rem,12vh,8rem)] w-full resize-y rounded-lg border bg-background p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        notesField.isActive ? "border-primary ring-2 ring-primary" : ""
                      }`}
                    />
                  </CardContent>
                </Card>
              </aside>
            </div>

            <SaleMobileActionBar lines={lines} isSubmitting={createSaleMutation.isPending} onSubmit={handleSubmit(processSubmit)} />
          </WorkspacePage>
        </form>
      </FormProvider>
    </TransactionKeyboardProvider>
  );
}

export function NewSaleForm() {
  return <TransactionFocusProvider><NewSaleFormContent /></TransactionFocusProvider>;
}
