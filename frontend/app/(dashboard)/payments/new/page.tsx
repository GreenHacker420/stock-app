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
import { ArrowLeft, Save, CreditCard } from "lucide-react";

export default function NewPaymentPage() {
  const router = useRouter();
  const { token, activeShopId } = useAuthStore();
  const [customerName, setCustomerName] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [amount, setAmount] = useState<number>(0);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/payments", {
        method: "POST",
        token: token || undefined,
        body: {
          shopId: activeShopId,
          customerName,
          paymentMode,
          amount,
          referenceNumber,
          notes,
        },
      });
      router.push("/payments");
    } catch {
      router.push("/payments");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/payments">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Receive Payment</h1>
          <p className="text-xs text-muted-foreground">Record cash collection, UPI transfer, card payment or cheque deposit (F6).</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Payment Receipt Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Customer / Payer Name</label>
              <Input placeholder="Enter customer name..." value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-9 text-xs" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold">Payment Mode</label>
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className="w-full h-9 border rounded-md px-2 text-xs bg-background">
                  <option value="CASH">CASH</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">CARD</option>
                  <option value="BANK_TRANSFER">BANK TRANSFER</option>
                  <option value="CHEQUE">CHEQUE</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Amount Received (₹)</label>
                <Input type="number" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-bold text-emerald-600" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Reference / UTR / Cheque Number</label>
              <Input placeholder="Enter UTR or cheque reference..." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="h-9 text-xs font-mono" />
            </div>
            <div>
              <label className="text-xs font-semibold">Notes / Description</label>
              <Input placeholder="Optional receipt notes..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-xs" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center bg-muted/30 pt-4">
            <div className="text-sm font-black text-emerald-600">Total Receipt: {formatINR(amount)}</div>
            <Button type="submit" size="lg" className="font-bold" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              Save Payment Receipt
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
