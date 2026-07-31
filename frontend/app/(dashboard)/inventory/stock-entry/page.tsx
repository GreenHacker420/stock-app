"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Plus } from "lucide-react";

export default function StockEntryPage() {
  const router = useRouter();
  const { token, activeShopId } = useAuthStore();
  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShopId) return;

    setIsSubmitting(true);
    try {
      await apiRequest("/stock", {
        method: "POST",
        token: token || undefined,
        body: {
          shopId: activeShopId,
          productName,
          sku,
          quantity,
          purchasePrice,
          sellingPrice,
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
          <h1 className="text-2xl font-black tracking-tight">Bulk Stock Entry</h1>
          <p className="text-xs text-muted-foreground">Inward goods movement and physical stock additions (F9).</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Stock Inward Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold">Product Name</label>
              <Input placeholder="Enter product name..." value={productName} onChange={(e) => setProductName(e.target.value)} className="h-9 text-xs" autoFocus />
            </div>
            <div>
              <label className="text-xs font-semibold">SKU / Barcode</label>
              <Input placeholder="Enter SKU or scan barcode..." value={sku} onChange={(e) => setSku(e.target.value)} className="h-9 text-xs font-mono" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold">Quantity Inward</label>
                <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-bold" />
              </div>
              <div>
                <label className="text-xs font-semibold">Purchase Price (₹)</label>
                <Input type="number" min="0" value={purchasePrice} onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)} className="h-9 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold">Selling Price (₹)</label>
                <Input type="number" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)} className="h-9 text-xs font-bold" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end pt-4 bg-muted/30">
            <Button type="submit" size="lg" className="font-bold" disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              Save Stock Entry
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
