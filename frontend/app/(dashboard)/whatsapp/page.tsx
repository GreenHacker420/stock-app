"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, MessageSquare, RefreshCw, AlertCircle, Radio } from "lucide-react";

export default function WhatsAppPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const {
    data: capability,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["whatsapp", "capability", currentShopId],
    queryFn: () => apiRequest(`/whatsapp/capability?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">WhatsApp Communications</h1>
            <p className="text-xs text-muted-foreground">
              Cloud API integration status, capabilities, and automated channel health for active shop.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry / Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-xs text-muted-foreground">
            Verifying WhatsApp integration capability...
          </CardContent>
        </Card>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm font-bold">Failed to load WhatsApp Status</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            {(error as any)?.message || "An unexpected error occurred while querying WhatsApp integration capability."}
          </AlertDescription>
        </Alert>
      ) : !capability || !capability.hasAccessToken ? (
        <Card className="border-dashed">
          <CardHeader className="text-center py-8">
            <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 flex items-center justify-center mb-3">
              <MessageSquare className="h-6 w-6" />
            </div>
            <CardTitle className="text-base font-bold">WhatsApp integration is not connected for this shop.</CardTitle>
            <CardDescription className="text-xs max-w-md mx-auto mt-1">
              Configure WhatsApp Cloud API credentials in Meta Business Suite to enable automated invoice receipts and customer broadcasts.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Radio className="h-4 w-4 text-emerald-500" />
                  <span>Channel Capability & Integration Details</span>
                </CardTitle>
                <CardDescription className="text-xs">Active Meta Cloud API Integration</CardDescription>
              </div>
              <Badge variant="outline" className="text-xs text-emerald-600 bg-emerald-50 border-emerald-200">
                {capability.status || "CONNECTED"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/20">
                <div>
                  <span className="text-muted-foreground font-semibold">Business Name:</span>
                  <p className="font-bold text-slate-900 dark:text-slate-100">{capability.businessName || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">Phone Number:</span>
                  <p className="font-mono font-bold">{capability.phoneNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-semibold">Messaging Limit:</span>
                  <p className="font-mono">{capability.messagingLimitTier || "STANDARD"}</p>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4 text-primary" />
                <AlertTitle className="text-xs font-bold">Web Dashboard Inbox Limitation</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  WhatsApp conversations are not implemented in the web dashboard yet. Outbound receipts are dispatched directly via Cloud API services.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
