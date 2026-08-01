"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, MessageSquare, RefreshCw, Send, Layers } from "lucide-react";

export default function WhatsAppPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const { data: templates = [], isLoading: isLoadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ["whatsapp-templates", currentShopId],
    queryFn: () => apiRequest(`/whatsapp/templates?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const { data: broadcasts = [], isLoading: isLoadingBroadcasts, refetch: refetchBroadcasts } = useQuery({
    queryKey: ["whatsapp-broadcasts", currentShopId],
    queryFn: () => apiRequest(`/whatsapp/broadcasts?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const rawTemplates = Array.isArray(templates) ? templates : templates?.data || [];
  const rawBroadcasts = Array.isArray(broadcasts) ? broadcasts : broadcasts?.data || [];

  const handleRefresh = () => {
    refetchTemplates();
    refetchBroadcasts();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">WhatsApp Communications</h1>
            <p className="text-xs text-muted-foreground">Automated invoice receipts, message templates, and customer broadcasts for active shop.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Templates Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>Configured WhatsApp Message Templates</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Template Name</TableHead>
                  <TableHead className="text-xs">Language</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingTemplates ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      Loading WhatsApp templates...
                    </TableCell>
                  </TableRow>
                ) : rawTemplates.length > 0 ? (
                  rawTemplates.map((tpl: any, idx: number) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="font-bold text-slate-900 dark:text-slate-100">{tpl.name}</TableCell>
                      <TableCell className="font-mono">{tpl.language || "en"}</TableCell>
                      <TableCell className="text-muted-foreground">{tpl.category || "UTILITY"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50">
                          {tpl.status || "APPROVED"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      No WhatsApp message templates configured for this shop.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Broadcasts & Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <span>Broadcast Campaigns & Outbound Logs</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Campaign Name</TableHead>
                  <TableHead className="text-xs">Recipients</TableHead>
                  <TableHead className="text-xs">Sent Date</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingBroadcasts ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      Loading broadcast campaigns...
                    </TableCell>
                  </TableRow>
                ) : rawBroadcasts.length > 0 ? (
                  rawBroadcasts.map((bc: any, idx: number) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="font-bold">{bc.name || "Invoice Broadcast"}</TableCell>
                      <TableCell className="font-mono">{bc.totalRecipients || 1}</TableCell>
                      <TableCell className="text-muted-foreground">{bc.createdAt ? new Date(bc.createdAt).toLocaleDateString("en-IN") : "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-[10px]">
                          {bc.status || "COMPLETED"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      No WhatsApp broadcast logs found for active shop.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
