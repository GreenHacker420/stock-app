"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { FieldErrors } from "react-hook-form";
import type { SaleFormSchema } from "../lib/sale-schema";

interface SaleValidationSummaryProps {
  /** Non-field level errors (e.g. from backend, or cross-field Zod issues) */
  serverError?: string | null;
  /** RHF field errors — used to count and show a summary */
  fieldErrors?: FieldErrors<SaleFormSchema>;
}

export function SaleValidationSummary({ serverError, fieldErrors }: SaleValidationSummaryProps) {
  const fieldErrorMessages: string[] = [];

  if (fieldErrors) {
    const extract = (errors: Record<string, any>, prefix = "") => {
      for (const key of Object.keys(errors || {})) {
        const err = errors[key];
        if (!err) continue;
        if (typeof err.message === "string") {
          fieldErrorMessages.push(err.message);
        } else if (Array.isArray(err)) {
          err.forEach((e: any, i: number) => extract(e, `${prefix}${key}[${i}].`));
        } else if (typeof err === "object") {
          extract(err, `${prefix}${key}.`);
        }
      }
    };
    extract(fieldErrors as Record<string, any>);
  }

  const hasErrors = !!serverError || fieldErrorMessages.length > 0;
  if (!hasErrors) return null;

  return (
    <Alert variant="destructive" className="text-xs">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="space-y-1">
        {serverError && <p className="font-bold">{serverError}</p>}
        {fieldErrorMessages.length > 0 && (
          <ul className="list-disc list-inside space-y-0.5">
            {fieldErrorMessages.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
