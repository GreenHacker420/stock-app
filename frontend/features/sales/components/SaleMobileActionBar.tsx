"use client";

import { Button } from "@/components/ui/button";
import { formatINR, computeSaleTotals } from "../lib/sale-money";
import { Receipt, Loader2 } from "lucide-react";
import type { SaleLineFormValue } from "../lib/sale-types";

interface SaleMobileActionBarProps {
  lines: SaleLineFormValue[];
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function SaleMobileActionBar({ lines, isSubmitting, onSubmit }: SaleMobileActionBarProps) {
  const { totalAmount } = computeSaleTotals(lines);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t p-3 lg:hidden flex items-center justify-between shadow-lg">
      <div>
        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
          Total ({lines.length} items)
        </div>
        <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
          {formatINR(totalAmount)}
        </div>
      </div>

      <Button
        type="button"
        size="default"
        onClick={onSubmit}
        disabled={isSubmitting || lines.length === 0}
        className="font-bold text-xs gap-2 px-6"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Saving Sale...</span>
          </>
        ) : (
          <>
            <Receipt className="h-4 w-4" />
            <span>Complete Sale</span>
          </>
        )}
      </Button>
    </div>
  );
}
