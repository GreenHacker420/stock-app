"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Truck } from "lucide-react";

export default function StockTransferPage() {
  const router = useRouter();
  const { token, activeShopId, shops } = useAuthStore();
  const [targetShopId, setTargetShopId] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId || !targetShopId) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/stock/transfer", {
        method: "POST",
        token: token || undefined,
        body: {
          fromShopId: activeShopId,
          toShopId: targetShopId,
          productName,
          quantity,
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
          <h1 className="text-2xl font-black tracking-tight">Inter-Shop Stock Transfer</h1>
          <p className="text-xs text-muted-foreground">Transfer inventory stock between branches/shops (Alt+F9).</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Transfer Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Destination Shop</label>
              <select
                value={targetShopId}
                onChange={(e) => setTargetShopId(e.target.value)}
                className="w-full h-9 border rounded-md px-2 text-xs bg-background"
              >
                <option value="">Select destination shop...</option>
                {shops.filter((s) => s.id !== activeShopId).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.city})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Product Name</label>
              <Input placeholder="Enter product name..." value={productName} onChange={(e) => setProductName(e.target.value)} className="h-9 text-xs" autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold">Transfer Quantity</label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-bold" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end pt-4 bg-muted/30">
            <Button type="submit" size="lg" className="font-bold" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              Transfer Stock
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
