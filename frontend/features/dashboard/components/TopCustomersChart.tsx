"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Rectangle } from "recharts";
import type { RectangleProps } from "recharts";
import { TopCustomerRecord } from "../lib/analytics-types";
import { formatINR } from "../lib/analytics-formatters";
import { Users } from "lucide-react";

interface TopCustomersChartProps {
  data: TopCustomerRecord[];
}

// Custom bar shape — no Cell needed; all bars use the same color
function CustomerBar(props: RectangleProps) {
  return (
    <Rectangle
      {...props}
      fill="#6366f1"
      radius={[0, 4, 4, 0]}
      className="cursor-pointer transition-opacity hover:opacity-80"
    />
  );
}

export function TopCustomersChart({ data }: TopCustomersChartProps) {
  const router = useRouter();

  const chartConfig = {
    salesAmount: { label: "Sales Volume", color: "#6366f1" },
  };

  const hasData = data && data.length > 0;

  const handleBarClick = (chartData: unknown) => {
    const entry = chartData as { activePayload?: Array<{ payload: TopCustomerRecord }> };
    const customer = entry?.activePayload?.[0]?.payload;
    if (customer?.customerId) {
      router.push(`/customers/${customer.customerId}`);
    }
  };

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-600" />
          <span>Top Customer Accounts</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Highest purchasing customer accounts in selected range. Click bar to inspect ledger.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-56 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
            No customer billing recorded in selected range.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  accessibilityLayer
                  onClick={handleBarClick}
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
                      `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                    }
                  />
                  <YAxis
                    dataKey="customerName"
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
                            <div className="font-bold">{item.payload.customerName}</div>
                            <div className="text-muted-foreground">
                              Sales: {formatINR(item.payload.salesAmount)}
                            </div>
                            <div className="text-muted-foreground">
                              Invoices: {item.payload.invoiceCount}
                            </div>
                          </div>
                        )}
                      />
                    }
                  />
                  {/* shape prop with CustomerBar — no Cell */}
                  <Bar dataKey="salesAmount" shape={<CustomerBar />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
