"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider, SubmitHandler } from "react-hook-form";

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
import { Receipt, Save, ArrowLeft, Loader2, RotateCcw } from "lucide-react";
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

  // Unsaved changes guard
  const { confirmNavigation } = useUnsavedSaleGuard({
    isDirty,
    isSubmitted: methods.formState.isSubmitSuccessful,
  });

  // Mutation
  const createSaleMutation = useCreateSaleMutation({
    token,
    activeShopId,
    idempotencyKey,
    onSuccess: (sale) => {
      cycleKey();
      router.push(`/sales/${sale.id}`);
    },
    onError: (err: ApiError) => {
      setServerError(err.message || "Failed to record sale. Please review and try again.");
    },
  });

  const processSubmit: SubmitHandler<SaleFormValues> = (formData) => {
    setServerError(null);

    const parseResult = saleFormSchema.safeParse(formData);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      setServerError(issue?.message || "Validation failed");
      return;
    }

    const payload = buildSalePayload(parseResult.data);
    createSaleMutation.mutate(payload);
  };

  const handleBack = () => {
    if (confirmNavigation()) {
      router.push("/sales");
    }
  };

  const handleResetForm = () => {
    if (window.confirm("Clear all values and start a new sale draft?")) {
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
    }
  };

  const handleRemoveLine = (lineId: string) => {
    const currentLines = methods.getValues("lines");
    if (currentLines.length <= 1) return; // Keep at least one row
    const nextLines = currentLines.filter((l) => l._lineId !== lineId);
    methods.setValue("lines", nextLines, { shouldDirty: true });
  };

  const handleRemovePayment = (paymentId: string) => {
    const currentPayments = methods.getValues("payments");
    const nextPayments = currentPayments.filter((p) => p._paymentId !== paymentId);
    methods.setValue("payments", nextPayments, { shouldDirty: true });
  };

  return (
    <TransactionKeyboardProvider
      onSave={handleSubmit(processSubmit)}
      onRemoveLine={handleRemoveLine}
      onRemovePayment={handleRemovePayment}
      onAbandonDraft={handleBack}
    >
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(processSubmit)} className="space-y-6 max-w-7xl mx-auto pb-24 lg:pb-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={handleBack} className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                    <Receipt className="h-6 w-6 text-primary" />
                    <span>New Sale</span>
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a production-grade sale invoice with real-time stock and payment collection.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetForm}
                disabled={createSaleMutation.isPending}
                className="h-9 text-xs gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={createSaleMutation.isPending || lines.length === 0}
                className="h-9 font-bold text-xs gap-2 px-5"
              >
                {createSaleMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Sale (Ctrl+A)</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Validation Errors Alert */}
          <SaleValidationSummary serverError={serverError} fieldErrors={errors as any} />

          {/* Form Body Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Column */}
            <div className="lg:col-span-8 space-y-6">
              {/* Customer & Sale Metadata */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <SaleCustomerSelector />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
                    <div>
                      <label className="text-xs font-bold text-slate-900 dark:text-slate-100 block mb-1">
                        Sale Date
                      </label>
                      <Input
                        type="date"
                        max={getTodayIST()}
                        {...methods.register("saleDate")}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                        <input
                          type="checkbox"
                          checked={watch("gstRequired")}
                          onChange={(e) => methods.setValue("gstRequired", e.target.checked, { shouldDirty: true })}
                          className="rounded border-gray-300 h-4 w-4 text-primary focus:ring-primary"
                        />
                        <span>GST Required</span>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items Grid */}
              <Card>
                <CardContent className="p-4">
                  <div className="font-bold text-xs uppercase tracking-wider text-muted-foreground mb-3">
                    Line Items ({lines.length})
                  </div>
                  <SaleLineGrid />
                </CardContent>
              </Card>

              {/* Payment Panel */}
              <SalePaymentPanel />
            </div>

            {/* Side Rail */}
            <div className="lg:col-span-4 space-y-4">
              <SaleTotalsPanel lines={lines} payments={payments} isWalkin={isWalkin} />

              {/* Notes */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                    Internal Notes / Remarks
                  </label>
                  <textarea
                    {...methods.register("notes")}
                    placeholder="Optional sale notes or special instructions..."
                    className="w-full h-20 text-xs p-2.5 border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sticky Mobile Action Bar */}
          <SaleMobileActionBar
            lines={lines}
            isSubmitting={createSaleMutation.isPending}
            onSubmit={handleSubmit(processSubmit)}
          />
        </form>
      </FormProvider>
    </TransactionKeyboardProvider>
  );
}

export function NewSaleForm() {
  return (
    <TransactionFocusProvider>
      <NewSaleFormContent />
    </TransactionFocusProvider>
  );
}
