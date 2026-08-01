"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { PieChart, Pie, ResponsiveContainer, Sector } from "recharts";
import { PaymentMixItem } from "../lib/analytics-types";
import { formatINR } from "../lib/analytics-formatters";
import { CreditCard } from "lucide-react";

interface PaymentMixChartProps {
  data: PaymentMixItem[];
  totalCollected: number;
}

const MODE_COLORS: Record<string, string> = {
  CASH: "#10b981",
  UPI: "#6366f1",
  CARD: "#3b82f6",
  BANK_TRANSFER: "#8b5cf6",
  CHEQUE: "#f59e0b",
};

const MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI Payment",
  CARD: "Card Swipe",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
};

export function PaymentMixChart({ data, totalCollected }: PaymentMixChartProps) {
  // Embed fill directly on each data item — the modern Recharts approach, no Cell needed
  const enrichedData = data.map((d) => ({
    ...d,
    fill: MODE_COLORS[d.paymentMode] ?? "#94a3b8",
    name: MODE_LABELS[d.paymentMode] ?? d.paymentMode,
  }));

  const chartConfig = Object.fromEntries(
    enrichedData.map((d) => [d.paymentMode, { label: d.name, color: d.fill }])
  );

  const hasData = enrichedData.length > 0 && totalCollected > 0;

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-indigo-600" />
            <span>Collection Mix</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Total Collections:{" "}
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {formatINR(totalCollected)}
            </span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-64 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No collection payments recorded for selected range.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
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
                  {/*
                    fill is read directly from each data object — no Cell needed.
                    Recharts Pie reads `fill` from the data array per item.
                  */}
                  <Pie
                    data={enrichedData}
                    dataKey="amount"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                  />
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
