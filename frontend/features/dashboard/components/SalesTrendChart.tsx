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
    salesAmount: {
      label: "Sales Revenue",
      color: "var(--color-emerald-500, #10b981)",
    },
    expensesAmount: {
      label: "Recorded Expenses",
      color: "var(--color-rose-500, #f43f5e)",
    },
    salesLessRecordedExpenses: {
      label: "Sales Less Expenses",
      color: "var(--color-indigo-500, #6366f1)",
    },
  };

  const formattedData = data.map((d) => ({
    ...d,
    label: formatPeriodLabel(d.period, granularity),
  }));

  const hasData = formattedData.length > 0;

  return (
    <Card className="col-span-12 lg:col-span-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span>Sales & Expense Trend</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Revenue, recorded expenses, and net operational sales across selected range.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-64 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No sales or expense records found for selected period.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-[10px]"
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(val, name) => (
                          <div className="flex items-center justify-between w-full gap-4 text-xs font-mono">
                            <span className="text-muted-foreground">{String(name)}:</span>
                            <span className="font-bold">{formatINR(Number(val))}</span>
                          </div>
                        )}
                      />
                    }
                  />
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
