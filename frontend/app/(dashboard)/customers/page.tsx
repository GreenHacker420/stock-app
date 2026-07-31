"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Users, ArrowLeft, RefreshCw, FileText } from "lucide-react";

export default function CustomersPage() {
  const { token, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ["customers", activeShopId],
    queryFn: () => apiRequest(`/customers?shopId=${activeShopId || ""}`, { token: token || undefined }),
    enabled: !!token,
  });

  const filteredCustomers = Array.isArray(customers)
    ? customers.filter((c: any) =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Customers & Ledgers</h1>
            <p className="text-xs text-muted-foreground">Customer master directory, outstanding dues, and ledger history.</p>
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
              placeholder="Search customer name or phone..."
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
                  <TableHead className="w-20 text-xs text-center">Ledger</TableHead>
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
                  filteredCustomers.map((cust: any) => (
                    <TableRow key={cust.id} className="hover:bg-muted/40 text-xs cursor-pointer">
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{cust.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{cust.phone || "—"}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{cust.gstin || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(cust.creditLimit)}</TableCell>
                      <TableCell className="text-right font-black text-rose-600">
                        {formatINR(cust.outstandingAmount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No customers found.
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
