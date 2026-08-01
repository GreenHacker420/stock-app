"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";
import { getActionableFeatures, FeatureDefinition } from "@/lib/features/feature-availability";
import { Receipt, Truck, ShoppingBag, CreditCard, Warehouse, Calendar, Store } from "lucide-react";

const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  SALE_CREATE: Receipt,
  ORDER_CREATE: ShoppingBag,
  DM_CREATE: Truck,
  PAYMENT_CREATE: CreditCard,
  STOCK_ENTRY: Warehouse,
  STOCK_TRANSFER: Warehouse,
  PHYSICAL_STOCK: Warehouse,
};

interface RightActionRailProps {
  onOpenDateDialog?: () => void;
  onOpenShopDialog?: () => void;
}

export function RightActionRail({ onOpenDateDialog, onOpenShopDialog }: RightActionRailProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { isMac } = useOS();

  const actionableFeatures = getActionableFeatures();

  return (
    <TooltipProvider delay={300}>
      <aside className="w-52 border-l bg-card flex flex-col shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 hidden lg:flex p-3 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Quick Actions
        </div>
        <div className="space-y-1.5 flex-1">
          {actionableFeatures.map((feature: FeatureDefinition) => {
            const isPermitted = hasPermission(user, feature.requiredPermission);
            const isEnabled = feature.status === "ENABLED" && isPermitted;
            const isDisabled = feature.status === "DISABLED" || !isPermitted;
            const IconComp = FEATURE_ICONS[feature.id] ?? Receipt;
            const disabledReason = !isPermitted
              ? "You do not have permission for this action."
              : feature.disabledReason;

            const btn = (
              <Button
                key={feature.id}
                variant={isEnabled ? "default" : "outline"}
                size="sm"
                disabled={isDisabled}
                onClick={isEnabled ? () => router.push(feature.route) : undefined}
                aria-disabled={isDisabled}
                className={[
                  "w-full justify-between h-9 text-xs font-medium",
                  isEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <IconComp className="h-3.5 w-3.5" />
                  <span>{feature.label}</span>
                </span>
                {feature.shortcut && (
                  <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted/60 px-1 font-mono text-[9px] font-extrabold text-muted-foreground">
                    {formatShortcutForOS(feature.shortcut, isMac)}
                  </kbd>
                )}
              </Button>
            );

            if (isDisabled && disabledReason) {
              return (
                <Tooltip key={feature.id}>
                  <TooltipTrigger className="w-full" render={btn} />
                  <TooltipContent side="left" className="max-w-[200px] text-[11px]">
                    {disabledReason}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return btn;
          })}
        </div>

        {/* Utility actions — always functional */}
        <div className="border-t pt-2 space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenDateDialog?.()}
            className="w-full justify-between h-9 text-xs font-medium cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>Select Date</span>
            </span>
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted/60 px-1 font-mono text-[9px] font-extrabold text-muted-foreground">
              {formatShortcutForOS("f2", isMac)}
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenShopDialog?.()}
            className="w-full justify-between h-9 text-xs font-medium cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Store className="h-3.5 w-3.5" />
              <span>Switch Shop</span>
            </span>
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center rounded border bg-muted/60 px-1 font-mono text-[9px] font-extrabold text-muted-foreground">
              {formatShortcutForOS("f3", isMac)}
            </kbd>
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
