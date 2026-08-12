"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";
import { getActionableFeatures, type FeatureDefinition } from "@/lib/features/feature-availability";
import { Calendar, CreditCard, Receipt, ShoppingBag, Store, Truck, Warehouse } from "lucide-react";

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
    <aside className="hidden h-full w-[196px] shrink-0 flex-col border-l bg-card/65 xl:flex">
      <div className="border-b px-3 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick actions</div>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Keyboard shortcuts mirror available operations.</p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
        {actionableFeatures.map((feature: FeatureDefinition) => {
          const isPermitted = hasPermission(user, feature.requiredPermission);
          const isEnabled = feature.status === "ENABLED" && isPermitted;
          const Icon = FEATURE_ICONS[feature.id] ?? Receipt;
          const disabledReason = !isPermitted ? "You do not have permission for this action." : feature.disabledReason;

          const action = (
            <Button
              key={feature.id}
              variant={isEnabled ? "secondary" : "ghost"}
              size="sm"
              disabled={!isEnabled}
              onClick={isEnabled ? () => router.push(feature.route) : undefined}
              className={[
                "h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-[11px] font-medium",
                isEnabled ? "text-foreground" : "opacity-45",
              ].join(" ")}
            >
              <span className={isEnabled ? "flex size-6 items-center justify-center rounded-md bg-background shadow-xs" : "flex size-6 items-center justify-center rounded-md bg-muted"}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{feature.label}</span>
              {feature.shortcut && isEnabled ? (
                <kbd className="rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground">
                  {formatShortcutForOS(feature.shortcut, isMac)}
                </kbd>
              ) : null}
              {!isEnabled && feature.status === "DISABLED" ? <Badge variant="outline" className="h-4 px-1 text-[8px]">Soon</Badge> : null}
            </Button>
          );

          if (!isEnabled && disabledReason) {
            return (
              <Tooltip key={feature.id}>
                <TooltipTrigger className="w-full" render={action} />
                <TooltipContent side="left" className="max-w-64 text-[11px]">{disabledReason}</TooltipContent>
              </Tooltip>
            );
          }

          return action;
        })}
      </div>

      <div className="space-y-1 border-t p-2.5">
        <Button variant="ghost" size="sm" onClick={() => onOpenDateDialog?.()} className="h-9 w-full justify-start gap-2 px-2.5 text-[11px]">
          <span className="flex size-6 items-center justify-center rounded-md bg-muted"><Calendar className="size-3.5" /></span>
          <span className="flex-1 text-left">Business period</span>
          <kbd className="rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground">{formatShortcutForOS("f2", isMac)}</kbd>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenShopDialog?.()} className="h-9 w-full justify-start gap-2 px-2.5 text-[11px]">
          <span className="flex size-6 items-center justify-center rounded-md bg-muted"><Store className="size-3.5" /></span>
          <span className="flex-1 text-left">Switch shop</span>
          <kbd className="rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground">{formatShortcutForOS("f3", isMac)}</kbd>
        </Button>
      </div>
    </aside>
  );
}
