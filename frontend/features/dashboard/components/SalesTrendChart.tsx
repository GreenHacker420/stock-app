"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { SalesTrendItem } from "../lib/analytics-types";
import { formatINR, formatPeriodLabel } from "../lib/analytics-formatters";
import { TrendingUp } from "lucide-react";

interface SalesTrendChartProps {
  data: SalesTrendItem[];
  granularity: string;
}

export function SalesTrendChart({ data, granularity }: SalesTrendChartProps) {
  const chartConfig = {
    salesAmount: { label: "Sales Revenue", color: "var(--color-emerald-500, #10b981)" },
    expensesAmount: { label: "Recorded Expenses", color: "var(--color-rose-500, #f43f5e)" },
    salesLessRecordedExpenses: { label: "Sales Less Expenses", color: "var(--color-indigo-500, #6366f1)" },
  };

  const formattedData = data.map((item) => ({ ...item, label: formatPeriodLabel(item.period, granularity) }));
  const hasData = formattedData.length > 0;

  return (
    <Card className="col-span-12 overflow-hidden rounded-xl shadow-none xl:col-span-8">
      <CardHeader className="p-[clamp(0.8rem,1vw,1rem)] pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-emerald-600" /><span>Sales &amp; expense trend</span></CardTitle>
        <CardDescription className="text-[11px]">Revenue, recorded expenses, and operational sales less expenses across the selected range.</CardDescription>
      </CardHeader>
      <CardContent className="p-[clamp(0.6rem,0.9vw,0.9rem)] pt-0">
        {!hasData ? (
          <div className="flex h-[clamp(15rem,34vh,24rem)] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No sales or expense records found for the selected period.</div>
        ) : (
          <div className="h-[clamp(15rem,34vh,24rem)] w-full min-w-0">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                  <YAxis tickLine={false} axisLine={false} width={58} className="text-[10px]" tickFormatter={(value) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <div className="flex min-w-[clamp(9rem,12vw,12rem)] items-center justify-between gap-4 text-xs font-mono"><span className="text-muted-foreground">{String(name)}:</span><span className="font-bold">{formatINR(Number(value))}</span></div>} />} />
                  <Area type="monotone" dataKey="salesAmount" name="Sales Revenue" stroke="#10b981" fillOpacity={1} fill="url(#salesGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expensesAmount" name="Recorded Expenses" stroke="#f43f5e" fillOpacity={1} fill="url(#expGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="salesLessRecordedExpenses" name="Sales Less Expenses" stroke="#6366f1" strokeDasharray="4 4" fill="none" strokeWidth={2} />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
