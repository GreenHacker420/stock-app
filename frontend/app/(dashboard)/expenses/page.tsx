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
import { Plus, Search, ReceiptIndianRupee, ArrowLeft, RefreshCw } from "lucide-react";

export default function ExpensesPage() {
  const { token, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: expenses = [], isLoading, refetch } = useQuery({
    queryKey: ["expenses", activeShopId],
    queryFn: () => apiRequest(`/expenses?shopId=${activeShopId || ""}`, { token: token || undefined }),
    enabled: !!token,
  });

  const filteredExpenses = Array.isArray(expenses)
    ? expenses.filter((e: any) =>
        e.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.description?.toLowerCase().includes(searchTerm.toLowerCase())
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
            <h1 className="text-2xl font-black tracking-tight">Shop Expenses</h1>
            <p className="text-xs text-muted-foreground">Log shop operating expenses, petty cash, and vendor payouts.</p>
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
          <CardTitle className="text-sm font-bold">Expense Register</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search category or description..."
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
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs">Description</TableHead>
                  <TableHead className="text-xs">Mode</TableHead>
                  <TableHead className="text-xs text-right">Amount (₹)</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Loading expenses...
                    </TableCell>
                  </TableRow>
                ) : filteredExpenses.length > 0 ? (
                  filteredExpenses.map((exp: any) => (
                    <TableRow key={exp.id} className="hover:bg-muted/40 text-xs cursor-pointer">
                      <TableCell>{formatDate(exp.createdAt)}</TableCell>
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{exp.category}</TableCell>
                      <TableCell className="text-muted-foreground">{exp.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{exp.paymentMode || "CASH"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-rose-600">{formatINR(exp.amount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-[10px]">{exp.status || "LOGGED"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No expense entries recorded.
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
