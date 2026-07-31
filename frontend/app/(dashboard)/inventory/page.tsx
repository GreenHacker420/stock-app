"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Search, Warehouse, ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";

export default function InventoryPage() {
  const { token, activeShopId } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["items", activeShopId],
    queryFn: () => apiRequest(`/items?shopId=${activeShopId || ""}`, { token: token || undefined }),
    enabled: !!token,
  });

  const filteredItems = Array.isArray(items)
    ? items.filter((i: any) =>
        i.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Inventory & Products</h1>
            <p className="text-xs text-muted-foreground">Product catalog, live physical stock summary, and reorder levels.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          <Link href="/inventory/stock-entry">
            <Button size="sm" className="h-9 gap-1 font-bold text-xs">
              <Plus className="h-4 w-4" />
              <span>Stock Entry (F9)</span>
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold">Stock Summary Catalog</CardTitle>
          <div className="w-72 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search SKU or product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-24 text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Product Name</TableHead>
                  <TableHead className="text-xs">Unit</TableHead>
                  <TableHead className="text-xs text-right">Selling Price</TableHead>
                  <TableHead className="text-xs text-right">Physical Stock</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      Loading stock summary...
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length > 0 ? (
                  filteredItems.map((item: any) => {
                    const isLow = (item.availableStock ?? item.physicalStock ?? 0) <= (parseFloat(item.minimumStock) || 0);
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/40 text-xs cursor-pointer">
                        <TableCell className="font-mono text-muted-foreground">{item.sku || "—"}</TableCell>
                        <TableCell className="font-bold text-slate-900 dark:text-slate-100">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(item.defaultSellingPrice)}</TableCell>
                        <TableCell className="text-right font-black">{item.physicalStock ?? item.currentStock ?? 0}</TableCell>
                        <TableCell className="text-center">
                          {isLow ? (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertTriangle className="h-3 w-3" /> Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50">
                              Available
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                      No products found in catalog.
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
