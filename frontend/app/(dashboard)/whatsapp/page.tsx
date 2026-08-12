"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, MessageSquare, Radio, RefreshCw, ShieldCheck, TimerReset } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { apiRequest } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { queryKeys } from "@/lib/query/query-keys";

type WhatsAppCapability = {
  enabled: boolean;
  integrationId: string | null;
  phoneNumberId: string | null;
  channelScope: string;
  activeShopId: string;
  runtimeConfig: {
    socketGraceMs: number;
    notificationPreviewsEnabled: boolean;
    messagingWindowHours: number;
    mediaPolicy: Record<string, unknown>;
    retention: {
      messageTextRetentionDays: number | null;
      mediaFileRetentionDays: number;
      thumbnailRetentionDays: number;
      failedOperationRetentionDays: number;
      draftRetentionDays: number;
    };
  };
};

export default function WhatsAppPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const shopId = activeShopId || shops[0]?.id || "";

  const query = useQuery({
    queryKey: queryKeys.whatsapp.capability(shopId),
    queryFn: () => apiRequest<WhatsAppCapability>(`/whatsapp/capability?shopId=${encodeURIComponent(shopId)}`, { token }),
    enabled: Boolean(token && shopId),
    staleTime: 60_000,
  });

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Channels · WhatsApp"
        title="WhatsApp operations"
        description="Effective channel capability for the active shop. This page now displays only fields returned by the real capability endpoint."
        icon={MessageSquare}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void query.refetch()}><RefreshCw className="size-3.5" />Refresh capability</Button>}
      />

      {query.isLoading ? (
        <><div className="workspace-metric-grid">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[clamp(5.5rem,10vh,7rem)] rounded-xl" />)}</div><Skeleton className="h-[42vh] w-full rounded-xl" /></>
      ) : query.isError ? (
        <WorkspacePanel><div className="p-[clamp(0.8rem,1.2vw,1.25rem)]"><Alert variant="destructive"><AlertCircle className="size-4"/><AlertTitle>Capability check failed</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "The WhatsApp capability endpoint could not be queried."}</AlertDescription></Alert></div></WorkspacePanel>
      ) : query.data ? (
        <>
          <WorkspaceMetricGrid>
            <WorkspaceMetric label="Channel" value={query.data.enabled ? "Enabled" : "Not connected"} detail={`Resolution · ${query.data.channelScope}`} icon={Radio} tone={query.data.enabled ? "success" : "warning"} />
            <WorkspaceMetric label="Messaging window" value={`${query.data.runtimeConfig.messagingWindowHours}h`} detail="Runtime-configured customer messaging window" icon={TimerReset} />
            <WorkspaceMetric label="Socket grace" value={`${query.data.runtimeConfig.socketGraceMs} ms`} detail="Realtime connection grace period" icon={Radio} tone="info" />
            <WorkspaceMetric label="Notification previews" value={query.data.runtimeConfig.notificationPreviewsEnabled ? "Enabled" : "Disabled"} detail="Capability runtime policy" icon={ShieldCheck} />
          </WorkspaceMetricGrid>

          <div className="workspace-two-column">
            <WorkspacePanel title="Effective channel" description="Safe identifiers returned by GET /whatsapp/capability.">
              <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
                <InfoLine label="Active shop" value={query.data.activeShopId} mono />
                <InfoLine label="Integration ID" value={query.data.integrationId || "Not connected"} mono />
                <InfoLine label="Phone number ID" value={query.data.phoneNumberId || "Not connected"} mono />
                <InfoLine label="Channel scope" value={query.data.channelScope} />
              </div>
            </WorkspacePanel>

            <WorkspacePanel title="Retention policy" description="Runtime retention values exposed by the backend capability response.">
              <div className="divide-y px-[clamp(0.75rem,1vw,1rem)] text-xs">
                <InfoLine label="Media files" value={`${query.data.runtimeConfig.retention.mediaFileRetentionDays} days`} />
                <InfoLine label="Thumbnails" value={`${query.data.runtimeConfig.retention.thumbnailRetentionDays} days`} />
                <InfoLine label="Failed operations" value={`${query.data.runtimeConfig.retention.failedOperationRetentionDays} days`} />
                <InfoLine label="Drafts" value={`${query.data.runtimeConfig.retention.draftRetentionDays} days`} />
              </div>
            </WorkspacePanel>
          </div>

          <WorkspacePanel title="Web inbox status" description="No synthetic conversation data is shown.">
            <div className="p-[clamp(0.75rem,1vw,1rem)]">
              <Alert>
                <MessageSquare className="size-4" />
                <AlertTitle>{query.data.enabled ? "Channel connected; inbox UI is still deferred" : "WhatsApp integration is not connected for this shop"}</AlertTitle>
                <AlertDescription>
                  {query.data.enabled
                    ? "The backend exposes integration-scoped conversation and messaging APIs, but this web inbox has not yet been implemented on this branch. Existing backend notification and receipt services remain the source of truth."
                    : "Connect a valid WhatsApp integration through the supported onboarding workflow before conversation tooling can be used."}
                </AlertDescription>
              </Alert>
            </div>
          </WorkspacePanel>
        </>
      ) : null}
    </WorkspacePage>
  );
}

function InfoLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex min-h-[clamp(2.6rem,5vh,3.15rem)] items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={`min-w-0 truncate text-right font-semibold ${mono ? "font-mono text-[10px]" : ""}`} title={value}>{value}</span></div>;
}
