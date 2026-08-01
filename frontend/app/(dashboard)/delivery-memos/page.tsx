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
import { Plus, Search, Truck, ArrowLeft, RefreshCw } from "lucide-react";

export default function DeliveryMemosPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: dmsResponse, isLoading, refetch } = useQuery({
    queryKey: ["delivery-memos", currentShopId],
    queryFn: () => apiRequest(`/delivery-memos?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const rawDms = Array.isArray(dmsResponse)
    ? dmsResponse
    : dmsResponse?.deliveryMemos && Array.isArray(dmsResponse.deliveryMemos)
    ? dmsResponse.deliveryMemos
    : dmsResponse?.memos && Array.isArray(dmsResponse.memos)
    ? dmsResponse.memos
    : dmsResponse?.data && Array.isArray(dmsResponse.data)
    ? dmsResponse.data
    : dmsResponse?.data?.deliveryMemos && Array.isArray(dmsResponse.data.deliveryMemos)
    ? dmsResponse.data.deliveryMemos
    : [];

  const filteredDms = rawDms.filter((d: any) =>
    d.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.memoNumber?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h1 className="text-2xl font-black tracking-tight">Delivery Memos</h1>
            <p className="text-xs text-muted-foreground">Track goods dispatch, delivery challans, and pending conversions to sale.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link href="/delivery-memos/new">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Plus className="h-4 w-4" />
              <span>New DM (Alt+F8)</span>
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Delivery Challan Register</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search DM # or customer..."
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
                  <TableHead className="w-28 text-xs">DM #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Items</TableHead>
                  <TableHead className="text-xs text-right">Value (₹)</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Loading delivery memos...
                    </TableCell>
                  </TableRow>
                ) : filteredDms.length > 0 ? (
                  filteredDms.map((dm: any) => (
                    <TableRow key={dm.id} className="hover:bg-muted/40 text-xs cursor-pointer">
                      <TableCell className="font-bold text-primary">{dm.memoNumber || dm.id.slice(0, 8)}</TableCell>
                      <TableCell>{formatDate(dm.createdAt)}</TableCell>
                      <TableCell className="font-semibold">{dm.customerName || dm.customer?.name || "Customer"}</TableCell>
                      <TableCell className="text-right font-mono">{dm.items?.length || 0}</TableCell>
                      <TableCell className="text-right font-black">{formatINR(dm.totalAmount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={dm.invoiced ? "default" : "secondary"} className="text-[10px]">
                          {dm.invoiced ? "INVOICED" : "DELIVERED"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No delivery memos found.
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
