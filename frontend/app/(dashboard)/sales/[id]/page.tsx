"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR, formatDate } from "@/lib/utils";
import { printInvoiceDocument } from "@/lib/pdf/invoice-print";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, Printer, MessageSquare, Receipt } from "lucide-react";

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, shops, activeShopId } = useAuthStore();
  const selectedShop = shops.find((s) => s.id === activeShopId) || shops[0];

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => apiRequest(`/sales/${id}`, { token: token || undefined }),
    enabled: !!token && !!id,
  });

  const handlePrint = () => {
    if (sale) {
      printInvoiceDocument(sale, selectedShop);
    }
  };

  const handleWhatsApp = async () => {
    if (!token || !id) return;
    try {
      await apiRequest(`/sales/${id}/whatsapp-send`, {
        method: "POST",
        token,
      });
      alert("WhatsApp receipt sent!");
    } catch {
      alert("Could not send WhatsApp receipt.");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading sale invoice details...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/sales">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Invoice #{sale?.invoiceNumber || id.slice(0, 8)}</h1>
            <p className="text-xs text-muted-foreground">Sale Invoice Details & Standalone Print Document</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleWhatsApp} className="h-9 gap-1 text-xs">
            <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
            <span>Send WhatsApp</span>
          </Button>
          <Button size="sm" onClick={handlePrint} className="h-9 gap-1 font-bold text-xs">
            <Printer className="h-3.5 w-3.5" />
            <span>Print Invoice (Ctrl+P)</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">Tax Invoice</CardTitle>
            <p className="text-xs text-muted-foreground">Date: {formatDate(sale?.saleDate || sale?.createdAt)}</p>
          </div>
          <Badge variant={sale?.paymentStatus === "PAID" ? "default" : "secondary"}>
            {sale?.paymentStatus || "RECORDED"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg bg-muted/30 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-semibold text-muted-foreground">Customer Name</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{sale?.customerName || sale?.customer?.name || "Walk-in"}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground">GST Status</p>
              <p className="text-sm font-bold">{sale?.gstRequired ? "GST Invoice (18%)" : "Non-GST Invoice"}</p>
            </div>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Item Description</TableHead>
                  <TableHead className="w-24 text-xs text-right">Qty</TableHead>
                  <TableHead className="w-32 text-xs text-right">Rate (₹)</TableHead>
                  <TableHead className="w-32 text-xs text-right">Total (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale?.items?.map((item: any, idx: number) => (
                  <TableRow key={idx} className="text-xs">
                    <TableCell className="font-semibold">{item.item?.name || item.name || "Item"}</TableCell>
                    <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{formatINR(item.rate)}</TableCell>
                    <TableCell className="text-right font-black">{formatINR(item.quantity * item.rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-2 text-xs border p-4 rounded-lg bg-card">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-semibold">{formatINR(sale?.totalAmount)}</span>
              </div>
              <div className="flex justify-between font-black text-sm border-t pt-2">
                <span>Grand Total:</span>
                <span className="text-primary">{formatINR(sale?.totalAmount)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
