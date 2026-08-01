"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, User, Phone, Mail, MapPin, Building, FileText, CreditCard, Receipt, Wallet } from "lucide-react";

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, shops, activeShopId } = useAuthStore();
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: customer, isLoading: isLoadingCustomer } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiRequest(`/customers/${id}`, { token: token || undefined }),
    enabled: !!token && !!id,
  });

  const { data: sales = [], isLoading: isLoadingSales } = useQuery({
    queryKey: ["customer-sales", id, currentShopId],
    queryFn: () => apiRequest(`/customers/${id}/sales?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!id,
  });

  const { data: payments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["customer-payments", id, currentShopId],
    queryFn: () => apiRequest(`/customers/${id}/payments?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!id,
  });

  if (isLoadingCustomer) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading full customer profile...</div>;
  }

  const rawSales = Array.isArray(sales) ? sales : sales?.data || [];
  const rawPayments = Array.isArray(payments) ? payments : payments?.data || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/customers">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">{customer?.name || "Customer Account"}</h1>
              <Badge variant={customer?.type === "BUSINESS" ? "default" : "secondary"} className="text-xs">
                {customer?.type || "REGULAR"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Master customer profile, contact details, and full ledger timeline.</p>
          </div>
        </div>
      </div>

      {/* Primary Customer Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Outstanding Dues
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black text-rose-600">
            {formatINR(customer?.outstandingAmount)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Credit Limit
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {formatINR(customer?.creditLimit)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Advance Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-black text-emerald-600">
            {formatINR(customer?.advanceBalance ?? 0)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              GSTIN
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-extrabold font-mono text-slate-900 dark:text-slate-100">
            {customer?.gstin || "Non-GST Customer"}
          </CardContent>
        </Card>
      </div>

      {/* Full Contact & Address Metadata Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span>Contact & Billing Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1 font-semibold">
              <Phone className="h-3.5 w-3.5" /> Mobile Phone
            </span>
            <p className="font-bold text-slate-900 dark:text-slate-100">{customer?.phone || "—"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1 font-semibold">
              <Mail className="h-3.5 w-3.5" /> Email Address
            </span>
            <p className="font-bold text-slate-900 dark:text-slate-100">{customer?.email || "—"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1 font-semibold">
              <Building className="h-3.5 w-3.5" /> Contact Person
            </span>
            <p className="font-bold text-slate-900 dark:text-slate-100">{customer?.contactPerson || "—"}</p>
          </div>

          <div className="space-y-1 md:col-span-2">
            <span className="text-muted-foreground flex items-center gap-1 font-semibold">
              <MapPin className="h-3.5 w-3.5" /> Billing Address
            </span>
            <p className="font-bold text-slate-900 dark:text-slate-100">
              {[customer?.address, customer?.city].filter(Boolean).join(", ") || "No address on file."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sales Invoices & Transaction History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <span>Sales Invoices</span>
            </CardTitle>
            <CardDescription className="text-xs">Invoices generated for this customer account.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs text-right">Total Amount</TableHead>
                  <TableHead className="text-xs text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingSales ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      Loading sales history...
                    </TableCell>
                  </TableRow>
                ) : rawSales.length > 0 ? (
                  rawSales.map((sale: any) => (
                    <TableRow key={sale.id} className="hover:bg-muted/40 text-xs">
                      <TableCell className="font-bold text-primary">{sale.invoiceNumber || sale.id.slice(0, 8)}</TableCell>
                      <TableCell>{formatDate(sale.saleDate || sale.createdAt)}</TableCell>
                      <TableCell className="text-right font-black">{formatINR(sale.totalAmount || sale.finalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={sale.paymentStatus === "PAID" ? "default" : "secondary"} className="text-[10px]">
                          {sale.paymentStatus || "RECORDED"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      No sales transactions recorded for this customer.
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
