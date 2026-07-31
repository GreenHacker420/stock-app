"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, ReceiptIndianRupee, RefreshCw } from "lucide-react";

export default function CashSessionsPage() {
  const { token, activeShopId } = useAuthStore();

  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ["cash-sessions", activeShopId],
    queryFn: () => apiRequest(`/cash-sessions?shopId=${activeShopId || ""}`, { token: token || undefined }),
    enabled: !!token,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Cash Drawer & Sessions</h1>
            <p className="text-xs text-muted-foreground">Daily cash opening balances, closing drawer counts, and cash mismatch audits.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Daily Cash Register Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Opening Cash</TableHead>
                  <TableHead className="text-xs text-right">Cash Sales</TableHead>
                  <TableHead className="text-xs text-right">Expected Cash</TableHead>
                  <TableHead className="text-xs text-right">Actual Counted</TableHead>
                  <TableHead className="text-xs text-right">Difference</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      Loading cash sessions...
                    </TableCell>
                  </TableRow>
                ) : Array.isArray(sessions) && sessions.length > 0 ? (
                  sessions.map((sess: any) => {
                    const diff = (sess.actualCountedCash ?? 0) - (sess.expectedCash ?? 0);
                    return (
                      <TableRow key={sess.id} className="text-xs">
                        <TableCell className="font-semibold">{formatDate(sess.sessionDate || sess.createdAt)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(sess.openingBalance)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(sess.totalCashCollected)}</TableCell>
                        <TableCell className="text-right font-mono">{formatINR(sess.expectedCash)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatINR(sess.actualCountedCash)}</TableCell>
                        <TableCell className={`text-right font-black ${diff < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {formatINR(diff)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={sess.status === "CLOSED" ? "default" : "secondary"} className="text-[10px]">
                            {sess.status || "OPEN"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                      No cash drawer sessions recorded for active shop.
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
