"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Search, ShoppingBag, ArrowLeft, RefreshCw } from "lucide-react";

export default function OrdersPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: ordersResponse = [], isLoading, refetch } = useQuery({
    queryKey: ["orders", currentShopId],
    queryFn: () => apiRequest(`/orders?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const rawOrders = Array.isArray(ordersResponse)
    ? ordersResponse
    : ordersResponse?.data && Array.isArray(ordersResponse.data)
    ? ordersResponse.data
    : [];

  const filteredOrders = rawOrders.filter((o: any) =>
    o.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Customer Orders</h1>
            <p className="text-xs text-muted-foreground">Manage customer order booking, packing, and dispatch.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link href="/orders/new">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Plus className="h-4 w-4" />
              <span>New Order (Ctrl+F8)</span>
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Order Fulfilment Register</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search order # or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-28 text-xs">Order #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Items</TableHead>
                  <TableHead className="text-xs text-right">Total Amount</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Loading orders...
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length > 0 ? (
                  filteredOrders.map((ord: any) => (
                    <TableRow key={ord.id} className="hover:bg-muted/40 text-xs cursor-pointer">
                      <TableCell className="font-bold text-primary">{ord.orderNumber || ord.id.slice(0, 8)}</TableCell>
                      <TableCell>{formatDate(ord.createdAt)}</TableCell>
                      <TableCell className="font-semibold">{ord.customerName || ord.customer?.name || "Customer"}</TableCell>
                      <TableCell className="text-right font-mono">{ord.items?.length || 0}</TableCell>
                      <TableCell className="text-right font-black">{formatINR(ord.totalAmount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={ord.status === "DELIVERED" ? "default" : "secondary"} className="text-[10px]">
                          {ord.status || "CONFIRMED"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No active orders found for shop.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
