"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, ShieldAlert, Check, X, RefreshCw } from "lucide-react";

export default function ApprovalsPage() {
  const { token, activeShopId } = useAuthStore();

  const { data: approvals = [], isLoading, refetch } = useQuery({
    queryKey: ["approvals", activeShopId],
    queryFn: () => apiRequest(`/approvals?shopId=${activeShopId || ""}`, { token: token || undefined }),
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
            <h1 className="text-2xl font-black tracking-tight">Pending Approvals & Verifications</h1>
            <p className="text-xs text-muted-foreground">Owner review queue for staff price changes, stock overrides, and payment verifications.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Verification Action Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Requested By</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Description / Reason</TableHead>
                  <TableHead className="w-28 text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                      Loading pending verifications...
                    </TableCell>
                  </TableRow>
                ) : Array.isArray(approvals) && approvals.length > 0 ? (
                  approvals.map((appr: any) => (
                    <TableRow key={appr.id} className="text-xs">
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-bold">{appr.type || "VERIFICATION"}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{appr.requestedBy || "Staff"}</TableCell>
                      <TableCell>{formatDate(appr.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{appr.reason || "Price/Stock verification"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="default" className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="destructive" className="h-7 w-7">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                      No pending approvals requiring owner action.
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
