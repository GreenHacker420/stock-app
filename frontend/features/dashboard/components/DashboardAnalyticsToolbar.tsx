"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart2, Calendar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPresetRange } from "../lib/analytics-formatters";

interface DashboardAnalyticsToolbarProps {
  dateFrom: string;
  dateTo: string;
  granularity: string;
  onRangeChange: (range: { dateFrom: string; dateTo: string; granularity?: string }) => void;
}

export function DashboardAnalyticsToolbar({ dateFrom, dateTo, granularity, onRangeChange }: DashboardAnalyticsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateUrlAndTrigger = (from: string, to: string, nextGranularity?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("analyticsFrom", from);
    params.set("analyticsTo", to);
    if (nextGranularity) params.set("analyticsGranularity", nextGranularity);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    onRangeChange({ dateFrom: from, dateTo: to, granularity: nextGranularity });
  };

  const handleSelectPreset = (preset: "7D" | "30D" | "90D") => {
    const range = getPresetRange(preset);
    updateUrlAndTrigger(range.dateFrom, range.dateTo, "AUTO");
  };

  const isPreset7D = dateFrom === getPresetRange("7D").dateFrom && dateTo === getPresetRange("7D").dateTo;
  const isPreset30D = dateFrom === getPresetRange("30D").dateFrom && dateTo === getPresetRange("30D").dateTo;
  const isPreset90D = dateFrom === getPresetRange("90D").dateFrom && dateTo === getPresetRange("90D").dateTo;

  return (
    <div className="flex w-full flex-col gap-[clamp(0.65rem,1vw,1rem)] rounded-xl border bg-card p-[clamp(0.65rem,0.9vw,0.9rem)] shadow-[0_1px_2px_rgba(15,23,42,0.025)] xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-indigo-600 dark:text-indigo-300"><BarChart2 className="size-4" /></div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">Analytics range</span><Badge variant="outline" className="text-[9px]">Independent from business date</Badge></div>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{dateFrom} → {dateTo} · {granularity || "AUTO"}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
          {(["7D", "30D", "90D"] as const).map((preset) => {
            const active = preset === "7D" ? isPreset7D : preset === "30D" ? isPreset30D : isPreset90D;
            return <Button key={preset} variant={active ? "secondary" : "ghost"} size="sm" onClick={() => handleSelectPreset(preset)} className="h-7 px-[clamp(0.45rem,0.6vw,0.7rem)] text-[10px] font-semibold">{preset === "7D" ? "Last 7D" : preset === "30D" ? "Last 30D" : "Last 90D"}</Button>;
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-none">
          <Calendar className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
          <Input
            aria-label="Analytics start date"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              const value = event.target.value;
              if (value && dateTo && value <= dateTo) updateUrlAndTrigger(value, dateTo, granularity);
            }}
            className="h-8 w-[clamp(8.2rem,11vw,10.5rem)] flex-1 font-mono text-[10px] sm:flex-none"
          />
          <span className="text-[10px] text-muted-foreground">to</span>
          <Input
            aria-label="Analytics end date"
            type="date"
            value={dateTo}
            onChange={(event) => {
              const value = event.target.value;
              if (value && dateFrom && dateFrom <= value) updateUrlAndTrigger(dateFrom, value, granularity);
            }}
            className="h-8 w-[clamp(8.2rem,11vw,10.5rem)] flex-1 font-mono text-[10px] sm:flex-none"
          />
        </div>
      </div>
    </div>
  );
}
