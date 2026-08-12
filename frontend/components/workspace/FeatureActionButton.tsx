"use client";

import { useRouter } from "next/navigation";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth/auth-store";
import { getFeature, type FeatureId } from "@/lib/features/feature-availability";
import { hasPermission } from "@/lib/permissions/permissions";
import { useOS, formatShortcutForOS } from "@/lib/keyboard/os";
import { cn } from "@/lib/utils";

export function FeatureActionButton({
  featureId,
  icon: Icon,
  className,
  variant = "default",
  compact = false,
}: {
  featureId: FeatureId;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  compact?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { isMac } = useOS();
  const feature = getFeature(featureId);
  const permitted = hasPermission(user, feature.requiredPermission);
  const enabled = feature.status === "ENABLED" && permitted;
  const disabledReason = !permitted
    ? "You do not have permission for this action."
    : feature.disabledReason || "This workflow is not available yet.";

  const button = (
    <Button
      type="button"
      size="sm"
      variant={enabled ? variant : "outline"}
      disabled={!enabled}
      aria-disabled={!enabled}
      onClick={enabled ? () => router.push(feature.route) : undefined}
      className={cn(
        "h-9 gap-1.5 rounded-lg text-xs font-semibold",
        !enabled && "cursor-not-allowed opacity-55",
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {!compact ? <span>{feature.label}</span> : null}
      {feature.shortcut ? (
        <kbd className="ml-1 rounded border border-current/15 bg-current/5 px-1 py-0.5 font-mono text-[9px] font-semibold opacity-70">
          {formatShortcutForOS(feature.shortcut, isMac)}
        </kbd>
      ) : null}
    </Button>
  );

  if (enabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{button}</span>} />
      <TooltipContent side="bottom" className="max-w-[min(86vw,20rem)] text-[11px]">
        {disabledReason}
      </TooltipContent>
    </Tooltip>
  );
}
