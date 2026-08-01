"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Rectangle } from "recharts";
import type { RectangleProps } from "recharts";
import { TopItemRecord } from "../lib/analytics-types";
import { formatINR } from "../lib/analytics-formatters";
import { Package } from "lucide-react";

interface TopItemsChartProps {
  data: TopItemRecord[];
}

// Custom bar shapes — read fill from datum via props, no Cell
function RevenueBar(props: RectangleProps) {
  return <Rectangle {...props} fill="#10b981" radius={[0, 4, 4, 0]} />;
}
function QtyBar(props: RectangleProps) {
  return <Rectangle {...props} fill="#6366f1" radius={[0, 4, 4, 0]} />;
}

export function TopItemsChart({ data }: TopItemsChartProps) {
  const [metric, setMetric] = useState<"revenue" | "quantity">("revenue");

  const chartConfig = {
    revenue: { label: "Revenue Amount", color: "#10b981" },
    quantitySold: { label: "Quantity Sold", color: "#6366f1" },
  };

  const hasData = data && data.length > 0;

  const sortedData = [...data].sort((a, b) =>
    metric === "revenue" ? b.revenue - a.revenue : b.quantitySold - a.quantitySold
  );

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600" />
            <span>Top Products</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Highest selling catalog items by{" "}
            {metric === "revenue" ? "revenue" : "units sold"}.
          </CardDescription>
        </div>
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border text-[10px]">
          <Button
            variant={metric === "revenue" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMetric("revenue")}
            className="h-6 px-2 text-[10px]"
          >
            Revenue
          </Button>
          <Button
            variant={metric === "quantity" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMetric("quantity")}
            className="h-6 px-2 text-[10px]"
          >
            Qty
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-56 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No product sales recorded in selected range.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  accessibilityLayer
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    className="stroke-muted/40"
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    className="text-[10px]"
                    tickFormatter={(val) =>
                      metric === "revenue"
                        ? `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                        : String(val)
                    }
                  />
                  <YAxis
                    dataKey="itemName"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    className="text-[10px]"
                    width={80}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(val, name, item) => (
                          <div className="space-y-1 text-xs font-mono">
                            <div className="font-bold">{item.payload.itemName}</div>
                            <div className="text-muted-foreground">
                              Revenue: {formatINR(item.payload.revenue)}
                            </div>
                            <div className="text-muted-foreground">
                              Qty Sold: {item.payload.quantitySold}
                            </div>
                          </div>
                        )}
                      />
                    }
                  />
                  {/*
                    shape prop — RevenueBar / QtyBar components, no Cell.
                    Color is baked into the component, not per-datum.
                  */}
                  {metric === "revenue" ? (
                    <Bar dataKey="revenue" shape={<RevenueBar />} />
                  ) : (
                    <Bar dataKey="quantitySold" shape={<QtyBar />} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
