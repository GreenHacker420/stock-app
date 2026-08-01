"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Users, ArrowLeft, RefreshCw, FileText, ChevronRight } from "lucide-react";

export default function CustomersPage() {
  const router = useRouter();
  const { token, shops, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: customersResponse, isLoading, refetch } = useQuery({
    queryKey: ["customers", currentShopId],
    queryFn: () => apiRequest(`/customers?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const rawCustomers = Array.isArray(customersResponse)
    ? customersResponse
    : customersResponse?.data && Array.isArray(customersResponse.data)
    ? customersResponse.data
    : [];

  const filteredCustomers = rawCustomers.filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h1 className="text-2xl font-black tracking-tight">Customers & Ledgers</h1>
            <p className="text-xs text-muted-foreground">Click any row to open full customer ledger profile and transaction history.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Customer Directory</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer name, phone or GSTIN..."
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
                  <TableHead className="text-xs">Customer Name</TableHead>
                  <TableHead className="text-xs">Phone</TableHead>
                  <TableHead className="text-xs">GSTIN</TableHead>
                  <TableHead className="text-xs text-right">Credit Limit</TableHead>
                  <TableHead className="text-xs text-right">Outstanding Dues</TableHead>
                  <TableHead className="w-24 text-xs text-center">Ledger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Loading customer directory...
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length > 0 ? (
                  filteredCustomers.map((cust: any) => {
                    const dues = parseFloat(cust.outstandingAmount || "0");
                    return (
                      <TableRow
                        key={cust.id}
                        onClick={() => router.push(`/customers/${cust.id}`)}
                        className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/50 text-xs cursor-pointer transition-colors group"
                      >
                        <TableCell className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary">
                          {cust.name}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{cust.phone || "—"}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{cust.gstin || "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(cust.creditLimit)}</TableCell>
                        <TableCell className="text-right font-black text-rose-600">
                          {formatINR(dues)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" className="h-7 text-[11px] font-bold text-primary gap-1">
                            <FileText className="h-3.5 w-3.5" />
                            <span>View</span>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No customers found for this shop.
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
