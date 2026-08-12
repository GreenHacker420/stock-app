"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, type SubmitHandler } from "react-hook-form";

import { useAuthStore } from "@/lib/auth/auth-store";
import { TransactionFocusProvider } from "@/components/keyboard/TransactionFocusContext";
import { TransactionKeyboardProvider } from "@/components/keyboard/TransactionKeyboardProvider";
import { useNewSaleDraft, createEmptyLine, getTodayIST } from "../hooks/useNewSaleDraft";
import { useCreateSaleMutation } from "../api/sale.mutations";
import { useUnsavedSaleGuard } from "../hooks/useUnsavedSaleGuard";
import { saleFormSchema } from "../lib/sale-schema";
import { buildSalePayload } from "../lib/sale-payload";
import type { SaleFormValues } from "../lib/sale-types";

import { SaleCustomerSelector } from "./SaleCustomerSelector";
import { SaleLineGrid } from "./SaleLineGrid";
import { SalePaymentPanel } from "./SalePaymentPanel";
import { SaleTotalsPanel } from "./SaleTotalsPanel";
import { SaleValidationSummary } from "./SaleValidationSummary";
import { SaleMobileActionBar } from "./SaleMobileActionBar";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkspacePage, WorkspacePageHeader } from "@/components/workspace/WorkspacePage";
import { Receipt, Save, Loader2, RotateCcw } from "lucide-react";
import type { ApiError } from "@/lib/api/client";

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
    const parseResult = saleFormSchema.safeParse(formData);
    if (!parseResult.success) {
      setServerError(parseResult.error.issues[0]?.message || "Validation failed");
      return;
    }
    createSaleMutation.mutate(buildSalePayload(parseResult.data));
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
  };

  const handleRemoveLine = (lineId: string) => {
    const currentLines = methods.getValues("lines");
    if (currentLines.length <= 1) return;
    methods.setValue("lines", currentLines.filter((line) => line._lineId !== lineId), { shouldDirty: true });
  };

  const handleRemovePayment = (paymentId: string) => {
    methods.setValue("payments", methods.getValues("payments").filter((payment) => payment._paymentId !== paymentId), { shouldDirty: true });
  };

  return (
    <TransactionKeyboardProvider
      onSave={handleSubmit(processSubmit)}
      onRemoveLine={handleRemoveLine}
      onRemovePayment={handleRemovePayment}
      onAbandonDraft={handleBack}
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
                  <Button type="button" variant="outline" size="sm" onClick={handleResetForm} disabled={createSaleMutation.isPending} className="h-9 gap-1.5 text-xs">
                    <RotateCcw className="size-3.5" />Reset
                  </Button>
                  <Button type="submit" size="sm" disabled={createSaleMutation.isPending || lines.length === 0} className="h-9 gap-2 px-[clamp(0.8rem,1vw,1.15rem)] text-xs font-semibold">
                    {createSaleMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {createSaleMutation.isPending ? "Saving…" : "Save Sale (Ctrl+A)"}
                  </Button>
                </>
              )}
            />

            <SaleValidationSummary serverError={serverError} fieldErrors={errors} />

            <div
              className="grid min-w-0 items-start"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, clamp(21rem, 62vw, 58rem)), 1fr))",
                gap: "var(--workspace-gap)",
              }}
            >
              <div className="min-w-0 space-y-[var(--workspace-gap)]">
                <Card className="overflow-hidden rounded-xl shadow-none">
                  <CardContent className="space-y-[clamp(0.75rem,1.2vh,1rem)] p-[clamp(0.75rem,1vw,1rem)]">
                    <SaleCustomerSelector />
                    <div className="grid gap-[clamp(0.65rem,1vw,1rem)] border-t pt-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="sale-date" className="mb-1 block text-xs font-semibold">Sale date</label>
                        <Input id="sale-date" type="date" max={getTodayIST()} {...methods.register("saleDate")} className="h-[var(--workspace-control-height)] text-xs" />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={watch("gstRequired")}
                            onChange={(event) => methods.setValue("gstRequired", event.target.checked, { shouldDirty: true })}
                            className="size-4 rounded border-input accent-foreground"
                          />
                          GST invoice required
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-xl shadow-none">
                  <CardContent className="p-[clamp(0.65rem,0.9vw,0.95rem)]">
                    <div className="workspace-kicker mb-3">Line items · {lines.length}</div>
                    <SaleLineGrid />
                  </CardContent>
                </Card>

                <SalePaymentPanel />
              </div>

              <aside className="grid min-w-0 gap-[var(--workspace-gap)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))] xl:sticky xl:top-[var(--workspace-gutter-y)]">
                <SaleTotalsPanel lines={lines} payments={payments} isWalkin={isWalkin} />
                <Card className="rounded-xl shadow-none">
                  <CardContent className="space-y-2 p-[clamp(0.75rem,1vw,1rem)]">
                    <label htmlFor="sale-notes" className="workspace-kicker block">Internal notes / remarks</label>
                    <textarea
                      id="sale-notes"
                      {...methods.register("notes")}
                      placeholder="Optional sale notes or special instructions…"
                      className="min-h-[clamp(5.5rem,12vh,8rem)] w-full resize-y rounded-lg border bg-background p-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
