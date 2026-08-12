"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { PieChart, Pie, ResponsiveContainer } from "recharts";
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
  const enrichedData = data.map((item) => ({
    ...item,
    fill: MODE_COLORS[item.paymentMode] ?? "#94a3b8",
    name: MODE_LABELS[item.paymentMode] ?? item.paymentMode,
  }));

  const chartConfig = Object.fromEntries(enrichedData.map((item) => [item.paymentMode, { label: item.name, color: item.fill }]));
  const hasData = enrichedData.length > 0 && totalCollected > 0;

  return (
    <Card className="col-span-12 overflow-hidden rounded-xl shadow-none xl:col-span-4">
      <CardHeader className="p-[clamp(0.8rem,1vw,1rem)] pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="size-4 text-indigo-600" /><span>Collection mix</span></CardTitle>
        <CardDescription className="text-[11px]">Total collections <span className="font-semibold text-foreground">{formatINR(totalCollected)}</span></CardDescription>
      </CardHeader>
      <CardContent className="p-[clamp(0.6rem,0.9vw,0.9rem)] pt-0">
        {!hasData ? (
          <div className="flex h-[clamp(15rem,34vh,24rem)] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No collection payments recorded for the selected range.</div>
        ) : (
          <div className="h-[clamp(15rem,34vh,24rem)] w-full min-w-0">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <div className="flex min-w-[clamp(9rem,12vw,12rem)] items-center justify-between gap-4 text-xs font-mono"><span className="text-muted-foreground">{String(name)}:</span><span className="font-bold">{formatINR(Number(value))}</span></div>} />} />
                  <Pie data={enrichedData} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius="34%" outerRadius="54%" paddingAngle={3} />
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
