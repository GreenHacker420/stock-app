"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Save, ShoppingBag } from "lucide-react";

interface LineItem {
  itemId: string;
  name: string;
  quantity: number;
  rate: number;
  discount: number;
}

export default function NewSalePage() {
  const router = useRouter();
  const { token, activeShopId } = useAuthStore();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [gstRequired, setGstRequired] = useState(false);

  const [items, setItems] = useState<LineItem[]>([
    { itemId: "1", name: "", quantity: 1, rate: 0, discount: 0 },
  ]);

  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addItemRow = () => {
    setItems((prev) => [...prev, { itemId: `${prev.length + 1}`, name: "", quantity: 1, rate: 0, discount: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length > 1) {
      setItems((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updateItemRow = (index: number, field: keyof LineItem, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.rate - item.discount), 0);
  const gstAmount = gstRequired ? subtotal * 0.18 : 0;
  const grandTotal = subtotal + gstAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/sales", {
        method: "POST",
        token: token || undefined,
        body: {
          shopId: activeShopId,
          customerInfo: { name: customerName, phone: customerPhone },
          items: items.filter((i) => i.name.trim() !== "").map((i) => ({
            itemId: i.itemId,
            quantity: i.quantity,
            rate: i.rate,
            discountAmount: i.discount,
          })),
          payments: amountPaid > 0 ? [{ paymentMode, amount: amountPaid }] : [],
          gstRequired,
        },
      });
      router.push("/sales");
    } catch (err) {
      // Direct user back to register
      router.push("/sales");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/sales">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">New Sale Entry</h1>
            <p className="text-xs text-muted-foreground">Spreadsheet-style sale transaction invoice creation (F8).</p>
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          Scope: Form (Ctrl+A to Save)
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer & GST Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">1. Customer & Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Customer Name</label>
              <Input
                placeholder="Walk-in or customer name..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Phone Number</label>
              <Input
                placeholder="10-digit mobile number..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1 flex flex-col justify-end">
              <Button
                type="button"
                variant={gstRequired ? "default" : "outline"}
                size="sm"
                onClick={() => setGstRequired(!gstRequired)}
                className="h-9 text-xs font-bold"
              >
                {gstRequired ? "✓ GST Invoice Enabled (18%)" : "Non-GST Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Item Rows Table */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold">2. Line Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItemRow} className="h-8 text-xs gap-1">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Row</span>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-12 text-xs">#</TableHead>
                    <TableHead className="text-xs">Product / Item Name</TableHead>
                    <TableHead className="w-28 text-xs text-right">Quantity</TableHead>
                    <TableHead className="w-32 text-xs text-right">Rate (₹)</TableHead>
                    <TableHead className="w-28 text-xs text-right">Discount (₹)</TableHead>
                    <TableHead className="w-32 text-xs text-right">Total (₹)</TableHead>
                    <TableHead className="w-12 text-xs text-center"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => {
                    const lineTotal = item.quantity * item.rate - item.discount;
                    return (
                      <TableRow key={idx} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            placeholder="Enter item or scan barcode..."
                            value={item.name}
                            onChange={(e) => updateItemRow(idx, "name", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItemRow(idx, "quantity", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={item.rate}
                            onChange={(e) => updateItemRow(idx, "rate", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={item.discount}
                            onChange={(e) => updateItemRow(idx, "discount", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs">{formatINR(lineTotal)}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItemRow(idx)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Totals & Payments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">3. Payment Receipt (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full h-9 border rounded-md px-2 text-xs bg-background"
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">CARD</option>
                    <option value="BANK_TRANSFER">BANK TRANSFER</option>
                    <option value="CHEQUE">CHEQUE</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold">Amount Received (₹)</label>
                  <Input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatINR(subtotal)}</span>
              </div>
              {gstRequired && (
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">GST (18%)</span>
                  <span className="font-semibold">{formatINR(gstAmount)}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b text-sm font-black">
                <span>Grand Total</span>
                <span className="text-primary">{formatINR(grandTotal)}</span>
              </div>
            </CardContent>
            <CardFooter className="pt-2">
              <Button type="submit" size="lg" className="w-full font-bold" disabled={isSubmitting}>
                <Save className="mr-2 h-4 w-4" />
                Save & Issue Sale Invoice (Ctrl+A)
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
    </div>
  );
}
