"use client";

import type { ComponentType, ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function WorkspaceMetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("workspace-metric-grid", className)}>{children}</div>;
}

export function WorkspaceMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  loading?: boolean;
}) {
  return (
    <div className={cn("workspace-metric", `workspace-metric--${tone}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="workspace-kicker">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-[min(30vw,7rem)]" /> : <div className="numeric-cell mt-1 text-[clamp(1.15rem,1.35vw,1.55rem)] font-semibold tracking-tight">{value}</div>}
        </div>
        {Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/75 text-muted-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      {detail ? <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
