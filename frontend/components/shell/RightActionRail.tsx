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
    <aside className="hidden h-full w-[clamp(10.75rem,12.8vw,14rem)] shrink-0 flex-col border-l bg-card/68 xl:flex">
      <div className="shrink-0 border-b px-[clamp(0.6rem,0.8vw,0.85rem)] py-[clamp(0.55rem,1vh,0.8rem)]">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quick actions</div>
        <p className="mt-1 text-[9px] leading-4 text-muted-foreground">Only enabled workflows register shortcuts.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-[clamp(0.15rem,0.35vh,0.3rem)] overflow-y-auto p-[clamp(0.45rem,0.65vw,0.7rem)]">
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
                "h-[clamp(2.05rem,4.25vh,2.4rem)] w-full justify-start gap-[clamp(0.35rem,0.45vw,0.55rem)] rounded-lg px-[clamp(0.45rem,0.55vw,0.65rem)] text-[clamp(0.62rem,0.66vw,0.72rem)] font-medium",
                isEnabled ? "text-foreground" : "opacity-45",
              ].join(" ")}
            >
              <span className={isEnabled ? "flex size-[clamp(1.3rem,2.7vh,1.55rem)] items-center justify-center rounded-md bg-background shadow-xs" : "flex size-[clamp(1.3rem,2.7vh,1.55rem)] items-center justify-center rounded-md bg-muted"}>
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{feature.label}</span>
              {feature.shortcut && isEnabled ? <kbd className="rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground">{formatShortcutForOS(feature.shortcut, isMac)}</kbd> : null}
              {!isEnabled && feature.status === "DISABLED" ? <Badge variant="outline" className="h-4 px-1 text-[8px]">Soon</Badge> : null}
            </Button>
          );

          if (!isEnabled && disabledReason) {
            return <Tooltip key={feature.id}><TooltipTrigger className="w-full" render={action} /><TooltipContent side="left" className="w-[min(80vw,18rem)] text-[11px]">{disabledReason}</TooltipContent></Tooltip>;
          }
          return action;
        })}
      </div>

      <div className="shrink-0 space-y-1 border-t p-[clamp(0.45rem,0.65vw,0.7rem)]">
        <Button variant="ghost" size="sm" onClick={() => onOpenDateDialog?.()} className="h-[clamp(2.05rem,4.25vh,2.4rem)] w-full justify-start gap-2 px-2 text-[10px]"><span className="flex size-6 items-center justify-center rounded-md bg-muted"><Calendar className="size-3.5" /></span><span className="flex-1 text-left">Business period</span><kbd className="rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground">{formatShortcutForOS("f2", isMac)}</kbd></Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenShopDialog?.()} className="h-[clamp(2.05rem,4.25vh,2.4rem)] w-full justify-start gap-2 px-2 text-[10px]"><span className="flex size-6 items-center justify-center rounded-md bg-muted"><Store className="size-3.5" /></span><span className="flex-1 text-left">Switch shop</span><kbd className="rounded border bg-background px-1 font-mono text-[8px] text-muted-foreground">{formatShortcutForOS("f3", isMac)}</kbd></Button>
      </div>
    </aside>
  );
}
