"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { FieldErrors, FieldError } from "react-hook-form";
import type { SaleFormSchema } from "../lib/sale-schema";

interface SaleValidationSummaryProps {
  serverError?: string | null;
  fieldErrors?: FieldErrors<SaleFormSchema>;
}

function isFieldError(value: unknown): value is FieldError {
  return Boolean(value && typeof value === "object" && "message" in value);
}

function collectErrorMessages(value: unknown, messages: string[]) {
  if (!value) return;
  if (isFieldError(value) && typeof value.message === "string") {
    messages.push(value.message);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectErrorMessages(item, messages));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectErrorMessages(item, messages));
  }
}

export function SaleValidationSummary({ serverError, fieldErrors }: SaleValidationSummaryProps) {
  const fieldErrorMessages: string[] = [];
  collectErrorMessages(fieldErrors, fieldErrorMessages);

  if (!serverError && fieldErrorMessages.length === 0) return null;

  return (
    <Alert variant="destructive" className="text-xs">
      <AlertCircle className="size-4" />
      <AlertDescription className="space-y-1">
        {serverError ? <p className="font-semibold">{serverError}</p> : null}
        {fieldErrorMessages.length > 0 ? (
          <ul className="list-inside list-disc space-y-0.5">
            {fieldErrorMessages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
