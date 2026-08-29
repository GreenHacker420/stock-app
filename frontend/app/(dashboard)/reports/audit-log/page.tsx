"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, RefreshCw } from "lucide-react";

interface AuditLogEntry { id: string; createdAt: string; action: string; details?: string | null; description?: string | null; actorName?: string | null; user?: { name?: string | null } | null }

export default function AuditLogPage() {
  const { token, activeShopId } = useAuthStore();
  const { data: logs = [], isLoading, refetch } = useQuery<AuditLogEntry[]>({ queryKey: ["audit-logs", activeShopId], queryFn: () => apiRequest<AuditLogEntry[]>(`/audit-logs?shopId=${activeShopId || ""}`, { token: token || undefined }), enabled: !!token });
  return <div className="space-y-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Link href="/reports"><Button variant="ghost" size="icon" className="h-9 w-9"><ArrowLeft className="h-4 w-4" /></Button></Link><div><h1 className="text-2xl font-black tracking-tight">Audit Log Register</h1><p className="text-xs text-muted-foreground">Immutable audit trail of all staff and system operations across shops.</p></div></div><Button variant="outline" size="sm" onClick={() => void refetch()} className="h-9 gap-1 text-xs"><RefreshCw className="h-3.5 w-3.5" /><span>Refresh</span></Button></div><Card><CardHeader><CardTitle className="text-sm font-bold">Audit Event Logs</CardTitle></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="text-xs">Timestamp</TableHead><TableHead className="text-xs">User / Actor</TableHead><TableHead className="text-xs">Action Type</TableHead><TableHead className="text-xs">Details</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">Loading audit logs...</TableCell></TableRow> : logs.length > 0 ? logs.map((log) => <TableRow key={log.id} className="text-xs"><TableCell className="font-mono text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell><TableCell className="font-bold">{log.user?.name || log.actorName || "System"}</TableCell><TableCell><Badge variant="outline" className="font-mono text-[10px]">{log.action}</Badge></TableCell><TableCell className="text-slate-700 dark:text-slate-300">{log.details || log.description || "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">No audit logs found.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></div>;
}
