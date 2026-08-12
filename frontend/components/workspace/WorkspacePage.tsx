"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WorkspacePage({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("workspace-page", className)}>{children}</section>;
}

export function WorkspacePageHeader({
  kicker,
  title,
  description,
  icon: Icon,
  backHref = "/dashboard",
  actions,
  meta,
}: {
  kicker?: string;
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  backHref?: string | null;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="workspace-page-header">
      <div className="flex min-w-0 items-start gap-[clamp(0.5rem,0.8vw,0.875rem)]">
        {backHref ? (
          <Button asChild variant="ghost" size="icon" className="mt-0.5 size-9 shrink-0 rounded-lg">
            <Link href={backHref} aria-label="Back">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        ) : null}

        {Icon ? (
          <div className="mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex">
            <Icon className="size-4" />
          </div>
        ) : null}

        <div className="min-w-0">
          {kicker ? <div className="workspace-kicker mb-1">{kicker}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="workspace-title">{title}</h1>
            {meta}
          </div>
          {description ? <p className="workspace-description">{description}</p> : null}
        </div>
      </div>

      {actions ? <div className="workspace-page-actions">{actions}</div> : null}
    </header>
  );
}

export function WorkspacePanel({
  children,
  className,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("workspace-panel", className)}>
      {title || description || actions ? (
        <div className="workspace-panel-header">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function WorkspaceToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("workspace-toolbar", className)}>{children}</div>;
}
