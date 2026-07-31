"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, FileText } from "lucide-react";

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token } = useAuthStore();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiRequest(`/customers/${id}`, { token: token || undefined }),
    enabled: !!token && !!id,
  });

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading customer ledger...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">{customer?.name || "Customer Profile"}</h1>
          <p className="text-xs text-muted-foreground">Ledger account statement and transaction history</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Phone Number</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-bold font-mono">{customer?.phone || "—"}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Credit Limit</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-bold">{formatINR(customer?.creditLimit)}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-black text-rose-600">{formatINR(customer?.outstandingAmount)}</CardContent>
        </Card>
      </div>
    </div>
  );
}
