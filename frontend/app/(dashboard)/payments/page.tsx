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
import { Plus, Search, CreditCard, ArrowLeft, RefreshCw } from "lucide-react";

export default function PaymentsPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: paymentsResponse, isLoading, refetch } = useQuery({
    queryKey: ["payments", currentShopId],
    queryFn: () => apiRequest(`/payments?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const rawPayments = Array.isArray(paymentsResponse)
    ? paymentsResponse
    : paymentsResponse?.payments && Array.isArray(paymentsResponse.payments)
    ? paymentsResponse.payments
    : paymentsResponse?.data && Array.isArray(paymentsResponse.data)
    ? paymentsResponse.data
    : paymentsResponse?.data?.payments && Array.isArray(paymentsResponse.data.payments)
    ? paymentsResponse.data.payments
    : [];

  const filteredPayments = rawPayments.filter((p: any) =>
    p.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h1 className="text-2xl font-black tracking-tight">Payments & Receipts</h1>
            <p className="text-xs text-muted-foreground">Receive payments, record cash/UPI/cheque entries, and verify collections.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link href="/payments/new">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Plus className="h-4 w-4" />
              <span>Receive Payment (F6)</span>
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Collections & Receipts Register</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reference # or customer..."
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
                  <TableHead className="w-28 text-xs">Date</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Payment Mode</TableHead>
                  <TableHead className="text-xs">Ref / UTR Number</TableHead>
                  <TableHead className="text-xs text-right">Amount (₹)</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Loading payment receipts...
                    </TableCell>
                  </TableRow>
                ) : filteredPayments.length > 0 ? (
                  filteredPayments.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/40 text-xs cursor-pointer">
                      <TableCell>{formatDate(p.receivedAt || p.paymentDate || p.createdAt)}</TableCell>
                      <TableCell className="font-semibold">{p.customerName || p.customer?.name || "Customer"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {p.paymentMode}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{p.referenceNumber || p.details?.upiReference || p.details?.bankUtr || "—"}</TableCell>
                      <TableCell className="text-right font-black text-emerald-600">{formatINR(p.amount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={p.status === "VERIFIED" ? "default" : "secondary"} className="text-[10px]">
                          {p.status || "RECORDED"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No payment receipts recorded for shop.
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
