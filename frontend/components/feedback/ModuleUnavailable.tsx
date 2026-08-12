"use client";

import Link from "next/link";
import { AlertCircle, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission } from "@/lib/permissions/permissions";

interface ModuleUnavailableProps {
  title: string;
  description: string;
  reason: string;
  backHref?: string;
  requiredPermission?: string;
  plannedShortcut?: string;
}

export function ModuleUnavailable({
  title,
  description,
  reason,
  backHref = "/dashboard",
  requiredPermission,
  plannedShortcut,
}: ModuleUnavailableProps) {
  const { user } = useAuthStore();
  const isPermitted = requiredPermission ? hasPermission(user, requiredPermission) : true;

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Workflow availability"
        title={title}
        description={description}
        backHref={backHref}
        icon={isPermitted ? AlertCircle : ShieldAlert}
        meta={plannedShortcut ? <Badge variant="outline" className="font-mono text-[9px]">Planned · {plannedShortcut}</Badge> : undefined}
      />

      <div className="grid min-h-[58vh] place-items-center">
        <WorkspacePanel className="w-[min(94vw,clamp(20rem,58vw,52rem))]">
          <div className="p-[clamp(1rem,2.1vw,2rem)]">
            <div className={`flex size-[clamp(2.7rem,5.5vh,3.4rem)] items-center justify-center rounded-xl border ${isPermitted ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-300" : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-300"}`}>
              {isPermitted ? <AlertCircle className="size-5" /> : <ShieldAlert className="size-5" />}
            </div>

            <h2 className="mt-[clamp(0.8rem,1.6vh,1.2rem)] text-[clamp(1rem,1.35vw,1.35rem)] font-semibold tracking-tight">
              {isPermitted ? "Workflow intentionally disabled" : "Access denied"}
            </h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {isPermitted ? reason : `Your current account does not include the required permission${requiredPermission ? ` (${requiredPermission})` : ""}. The backend remains the final authorization layer.`}
            </p>

            <div className="mt-[clamp(1rem,2vh,1.5rem)] flex flex-wrap items-center justify-between gap-3 border-t pt-[clamp(0.8rem,1.5vh,1rem)]">
              <div className="text-[10px] leading-4 text-muted-foreground">
                {isPermitted ? "No write request is sent from this page until the workflow is production-safe." : "No protected action has been attempted."}
              </div>
              <Button render={<Link href={backHref} />} variant="outline" size="sm" className="h-9 text-xs font-semibold">Return to register</Button>
            </div>
          </div>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
