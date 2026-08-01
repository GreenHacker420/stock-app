"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Rectangle } from "recharts";
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

// Embed fill directly on each data item — the modern shape prop approach, no Cell
interface OrderStatusDatum extends OrderStatusItem {
  fill: string;
}

// Custom bar shape that reads fill from the data item
function ColoredBar(props: RectangleProps & { fill?: string }) {
  return <Rectangle {...props} fill={props.fill} radius={[4, 4, 0, 0]} />;
}

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  const enrichedData: OrderStatusDatum[] = data.map((d) => ({
    ...d,
    fill: STATUS_COLORS[d.status] ?? "#94a3b8",
  }));

  const chartConfig = Object.fromEntries(
    enrichedData.map((d) => [d.status, { label: d.status, color: d.fill }])
  );
  chartConfig["count"] = { label: "Orders Count", color: "#94a3b8" };

  const hasData = enrichedData.length > 0;

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span>Order Status Snapshot</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Mutually exclusive customer order fulfillment statuses in range.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-56 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No customer orders booked in selected range.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={enrichedData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted/40"
                  />
                  <XAxis
                    dataKey="status"
                    tickLine={false}
                    axisLine={false}
                    className="text-[9px]"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-[10px]"
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                  {/*
                    shape prop reads fill from each datum automatically.
                    ColoredBar receives props.fill which comes from enrichedData[i].fill
                  */}
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
