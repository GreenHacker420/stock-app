"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { CustomerTrendItem } from "../lib/analytics-types";
import { formatPeriodLabel } from "../lib/analytics-formatters";
import { UserPlus } from "lucide-react";

interface CustomerGrowthChartProps {
  data: CustomerTrendItem[];
  granularity: string;
}

export function CustomerGrowthChart({ data, granularity }: CustomerGrowthChartProps) {
  const chartConfig = {
    newCustomers: { label: "New Accounts", color: "#8b5cf6" },
  };

  const formattedData = data.map((item) => ({ ...item, label: formatPeriodLabel(item.period, granularity) }));
  const hasData = formattedData.length > 0;

  return (
    <Card className="col-span-12 overflow-hidden rounded-xl shadow-none lg:col-span-4">
      <CardHeader className="p-[clamp(0.8rem,1vw,1rem)] pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4 text-purple-600" /><span>New customer growth</span></CardTitle>
        <CardDescription className="text-[11px]">New non-walk-in customer accounts created per bucket in the selected range.</CardDescription>
      </CardHeader>
      <CardContent className="p-[clamp(0.6rem,0.9vw,0.9rem)] pt-0">
        {!hasData ? (
          <div className="flex h-[clamp(13rem,27vh,20rem)] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No new customer accounts created in selected range.</div>
        ) : (
          <div className="h-[clamp(13rem,27vh,20rem)] w-full min-w-0">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-[10px]" />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px]" allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                  <Bar dataKey="newCustomers" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
