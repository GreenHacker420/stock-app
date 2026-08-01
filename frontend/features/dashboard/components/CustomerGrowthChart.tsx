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

  const formattedData = data.map((d) => ({
    ...d,
    label: formatPeriodLabel(d.period, granularity),
  }));

  const hasData = formattedData.length > 0;

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-purple-600" />
          <span>New Customer Growth</span>
        </CardTitle>
        <CardDescription className="text-xs">
          New non-walk-in customer accounts created per bucket in selected range.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-56 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No new customer accounts created in selected range.
          </div>
        ) : (
          <div className="h-56 w-full">
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
