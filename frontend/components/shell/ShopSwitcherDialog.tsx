"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Store, Check } from "lucide-react";

interface ShopSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShopSwitcherDialog({ open, onOpenChange }: ShopSwitcherDialogProps) {
  const { shops, activeShopId, setActiveShopId } = useAuthStore();

  const handleSelectShop = (shopId: string) => {
    setActiveShopId(shopId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Store className="h-4 w-4 text-primary" />
            <span>Switch Active Shop (F3)</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Select branch or retail outlet to switch operational context.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-3">
          {shops.map((shop) => {
            const isActive = shop.id === activeShopId;
            return (
              <Button
                key={shop.id}
                variant={isActive ? "default" : "outline"}
                onClick={() => handleSelectShop(shop.id)}
                className="w-full justify-between h-11 px-3 text-xs font-semibold cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  <span>{shop.name} ({shop.city})</span>
                </div>
                {isActive && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Check className="h-3 w-3" /> Active
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
