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
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";

export default function NewDeliveryMemoPage() {
  const router = useRouter();
  const { token, activeShopId } = useAuthStore();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [items, setItems] = useState([{ itemId: "1", name: "", quantity: 1, rate: 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalAmount = items.reduce((acc, i) => acc + i.quantity * i.rate, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/delivery-memos", {
        method: "POST",
        token: token || undefined,
        body: {
          shopId: activeShopId,
          customerName,
          customerPhone,
          items: items.filter((i) => i.name.trim() !== ""),
        },
      });
      router.push("/delivery-memos");
    } catch {
      router.push("/delivery-memos");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/delivery-memos">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">New Delivery Memo</h1>
          <p className="text-xs text-muted-foreground">Issue delivery challan for goods dispatch without immediate tax invoice (Alt+F8).</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Consignee / Customer Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold">Customer Name</label>
              <Input placeholder="Enter customer name..." value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold">Phone Number</label>
              <Input placeholder="Enter phone number..." value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-9 text-xs" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-bold">Dispatched Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems([...items, { itemId: `${items.length + 1}`, name: "", quantity: 1, rate: 0 }])} className="h-8 text-xs gap-1">
              <Plus className="h-3.5 w-3.5" />
              <span>Add Row</span>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Product Name</TableHead>
                  <TableHead className="w-28 text-xs text-right">Dispatched Qty</TableHead>
                  <TableHead className="w-32 text-xs text-right">Approx Rate (₹)</TableHead>
                  <TableHead className="w-32 text-xs text-right">Total (₹)</TableHead>
                  <TableHead className="w-12 text-xs"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input placeholder="Product name..." value={item.name} onChange={(e) => {
                        const val = e.target.value;
                        setItems(items.map((x, i) => i === idx ? { ...x, name: val } : x));
                      }} className="h-8 text-xs" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="1" value={item.quantity} onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setItems(items.map((x, i) => i === idx ? { ...x, quantity: val } : x));
                      }} className="h-8 text-xs text-right" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="0" value={item.rate} onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setItems(items.map((x, i) => i === idx ? { ...x, rate: val } : x));
                      }} className="h-8 text-xs text-right" />
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs">{formatINR(item.quantity * item.rate)}</TableCell>
                    <TableCell className="text-center">
                      <Button type="button" variant="ghost" size="icon" onClick={() => items.length > 1 && setItems(items.filter((_, i) => i !== idx))} className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="flex justify-between items-center bg-muted/30 pt-4">
            <div className="text-sm font-black">Total Challan Value: {formatINR(totalAmount)}</div>
            <Button type="submit" size="lg" className="font-bold" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              Save & Dispatch Delivery Memo
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
