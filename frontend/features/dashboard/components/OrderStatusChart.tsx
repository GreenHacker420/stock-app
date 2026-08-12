"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { RectangleProps } from "recharts";
import { OrderStatusItem } from "../lib/analytics-types";
import { ShoppingBag } from "lucide-react";

interface OrderStatusChartProps {
  data: OrderStatusItem[];
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "#3b82f6",
  PACKING: "#f59e0b",
  PARTIALLY_PACKED: "#fbbf24",
  PACKED: "#10b981",
  PARTIALLY_DISPATCHED: "#06b6d4",
  DISPATCHED: "#6366f1",
  CANCELLED: "#ef4444",
  DRAFT: "#94a3b8",
};

interface OrderStatusDatum extends OrderStatusItem {
  fill: string;
}

function ColoredBar(props: RectangleProps & { fill?: string }) {
  return <Rectangle {...props} fill={props.fill} radius={[4, 4, 0, 0]} />;
}

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  const enrichedData: OrderStatusDatum[] = data.map((item) => ({ ...item, fill: STATUS_COLORS[item.status] ?? "#94a3b8" }));
  const chartConfig = Object.fromEntries(enrichedData.map((item) => [item.status, { label: item.status, color: item.fill }]));
  chartConfig.count = { label: "Orders Count", color: "#94a3b8" };

  return (
    <Card className="col-span-12 overflow-hidden rounded-xl shadow-none lg:col-span-4">
      <CardHeader className="p-[clamp(0.8rem,1vw,1rem)] pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag className="size-4 text-indigo-600" /><span>Order status snapshot</span></CardTitle>
        <CardDescription className="text-[11px]">Mutually exclusive customer-order fulfilment statuses in the selected range.</CardDescription>
      </CardHeader>
      <CardContent className="p-[clamp(0.6rem,0.9vw,0.9rem)] pt-0">
        {enrichedData.length === 0 ? (
          <div className="flex h-[clamp(13rem,27vh,20rem)] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No customer orders booked in the selected range.</div>
        ) : (
          <div className="h-[clamp(13rem,27vh,20rem)] w-full min-w-0">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={enrichedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} className="text-[9px]" tickFormatter={(value) => String(value).replaceAll("_", " ")} />
                  <YAxis tickLine={false} axisLine={false} className="text-[10px]" allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                  <Bar dataKey="count" shape={<ColoredBar />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
