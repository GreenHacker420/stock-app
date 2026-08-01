"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft, ShieldAlert } from "lucide-react";
import { hasPermission } from "@/lib/permissions/permissions";
import { useAuthStore } from "@/lib/auth/auth-store";

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
    <div className="space-y-6 max-w-3xl mx-auto py-8">
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {!isPermitted ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="py-6">
            <div className="flex items-center gap-3 text-destructive">
              <ShieldAlert className="h-6 w-6 shrink-0" />
              <div>
                <CardTitle className="text-base font-bold">Access Denied</CardTitle>
                <CardDescription className="text-xs text-destructive/80 mt-0.5">
                  Your staff role does not have the required permission ({requiredPermission}) to access this module.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40">
          <CardHeader className="py-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Module Temporarily Unavailable
                  </CardTitle>
                  {plannedShortcut && (
                    <Badge variant="outline" className="text-[10px] font-mono border-amber-300 text-amber-700 dark:text-amber-300">
                      Shortcut: {plannedShortcut}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {reason}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex items-center justify-between border-t border-amber-200/60 dark:border-amber-900/40 mt-4 py-3">
            <span className="text-[11px] text-muted-foreground">
              Foundation Stabilization Sprint — Unsafe write API calls are disabled.
            </span>
            <Link href={backHref}>
              <Button variant="outline" size="sm" className="h-8 text-xs font-bold">
                Return to Register
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
