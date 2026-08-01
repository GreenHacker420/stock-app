"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Search, Receipt, ArrowLeft, RefreshCw, FileText, ChevronRight } from "lucide-react";

export default function SalesRegisterPage() {
  const router = useRouter();
  const { token, shops, activeShopId, startDate, endDate } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: salesResponse, isLoading, refetch } = useQuery({
    queryKey: ["sales", currentShopId, startDate, endDate],
    queryFn: () =>
      apiRequest(`/sales?shopId=${currentShopId}&dateFrom=${startDate}&dateTo=${endDate}`, {
        token: token || undefined,
      }),
    enabled: !!token && !!currentShopId,
  });

  const rawSales = Array.isArray(salesResponse)
    ? salesResponse
    : salesResponse?.data && Array.isArray(salesResponse.data)
    ? salesResponse.data
    : [];

  const filteredSales = rawSales.filter((s: any) =>
    s.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h1 className="text-2xl font-black tracking-tight">Sales Register</h1>
            <p className="text-xs text-muted-foreground">View and manage all sales transactions for period ({startDate} to {endDate}).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link href="/sales/new">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Plus className="h-4 w-4" />
              <span>New Sale (F8)</span>
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Invoices & Transactions</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer or invoice number..."
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
                  <TableHead className="w-28 text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs text-right">Payment Status</TableHead>
                  <TableHead className="text-xs text-center">GST</TableHead>
                  <TableHead className="w-24 text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      Loading sales register...
                    </TableCell>
                  </TableRow>
                ) : filteredSales.length > 0 ? (
                  filteredSales.map((sale: any) => (
                    <TableRow
                      key={sale.id}
                      onClick={() => router.push(`/sales/${sale.id}`)}
                      className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/50 text-xs cursor-pointer transition-colors group"
                    >
                      <TableCell className="font-bold text-primary group-hover:underline">
                        {sale.invoiceNumber || sale.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(sale.saleDate || sale.createdAt)}</TableCell>
                      <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                        {sale.customerName || sale.customer?.name || "Walk-in Customer"}
                      </TableCell>
                      <TableCell className="text-right font-black">{formatINR(sale.totalAmount || sale.finalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={sale.paymentStatus === "PAID" ? "default" : "secondary"} className="text-[10px]">
                          {sale.paymentStatus || "RECORDED"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {sale.gstRequired ? "GST" : "Non-GST"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-7 text-[11px] font-bold text-primary gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          <span>View</span>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      No sales found for period ({startDate} to {endDate}).
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
