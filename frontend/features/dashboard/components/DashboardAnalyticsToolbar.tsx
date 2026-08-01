"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getPresetRange } from "../lib/analytics-formatters";
import { Calendar, BarChart2 } from "lucide-react";

interface DashboardAnalyticsToolbarProps {
  dateFrom: string;
  dateTo: string;
  granularity: string;
  onRangeChange: (range: { dateFrom: string; dateTo: string; granularity?: string }) => void;
}

export function DashboardAnalyticsToolbar({
  dateFrom,
  dateTo,
  granularity,
  onRangeChange,
}: DashboardAnalyticsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelectPreset = (preset: "7D" | "30D" | "90D") => {
    const range = getPresetRange(preset);
    updateUrlAndTrigger(range.dateFrom, range.dateTo, "AUTO");
  };

  const handleCustomFromChange = (val: string) => {
    if (val && dateTo && val <= dateTo) {
      updateUrlAndTrigger(val, dateTo, granularity);
    }
  };

  const handleCustomToChange = (val: string) => {
    if (val && dateFrom && dateFrom <= val) {
      updateUrlAndTrigger(dateFrom, val, granularity);
    }
  };

  const updateUrlAndTrigger = (from: string, to: string, gran?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("analyticsFrom", from);
    params.set("analyticsTo", to);
    if (gran) params.set("analyticsGranularity", gran);
    router.replace(`${pathname}?${params.toString()}`);
    onRangeChange({ dateFrom: from, dateTo: to, granularity: gran });
  };

  const isPreset7D = dateFrom === getPresetRange("7D").dateFrom;
  const isPreset30D = dateFrom === getPresetRange("30D").dateFrom;
  const isPreset90D = dateFrom === getPresetRange("90D").dateFrom;
  const isCustom = !isPreset7D && !isPreset30D && !isPreset90D;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-xl bg-card shadow-xs">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <BarChart2 className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">Analytics Range</span>
            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
              Independent from Business Date
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {dateFrom} – {dateTo} ({granularity || "AUTO"} Bucketing)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border text-xs">
          <Button
            variant={isPreset7D ? "default" : "ghost"}
            size="sm"
            onClick={() => handleSelectPreset("7D")}
            className="h-7 text-xs px-2.5 font-bold"
          >
            Last 7D
          </Button>
          <Button
            variant={isPreset30D ? "default" : "ghost"}
            size="sm"
            onClick={() => handleSelectPreset("30D")}
            className="h-7 text-xs px-2.5 font-bold"
          >
            Last 30D
          </Button>
          <Button
            variant={isPreset90D ? "default" : "ghost"}
            size="sm"
            onClick={() => handleSelectPreset("90D")}
            className="h-7 text-xs px-2.5 font-bold"
          >
            Last 90D
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => handleCustomFromChange(e.target.value)}
            className="h-7 text-xs font-mono w-32"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => handleCustomToChange(e.target.value)}
            className="h-7 text-xs font-mono w-32"
          />
        </div>
      </div>
    </div>
  );
}
