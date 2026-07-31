"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Warehouse } from "lucide-react";

export default function PhysicalStockPage() {
  const router = useRouter();
  const { token, activeShopId } = useAuthStore();
  const [productName, setProductName] = useState("");
  const [countedQty, setCountedQty] = useState<number>(0);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/stock/physical", {
        method: "POST",
        token: token || undefined,
        body: {
          shopId: activeShopId,
          productName,
          countedQty,
          remarks,
        },
      });
      router.push("/inventory");
    } catch {
      router.push("/inventory");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/inventory">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Physical Stock Audit</h1>
          <p className="text-xs text-muted-foreground">Verify physical stock counts and log inventory variance adjustments (Ctrl+F7).</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Physical Count Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Product / Item Name</label>
              <Input placeholder="Enter or scan product..." value={productName} onChange={(e) => setProductName(e.target.value)} className="h-9 text-xs" autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold">Actual Physical Counted Qty</label>
              <Input type="number" min="0" value={countedQty} onChange={(e) => setCountedQty(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-bold text-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold">Reason / Audit Notes</label>
              <Input placeholder="Reason for physical audit..." value={remarks} onChange={(e) => setRemarks(e.target.value)} className="h-9 text-xs" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end pt-4 bg-muted/30">
            <Button type="submit" size="lg" className="font-bold" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              Save Physical Audit Count
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
