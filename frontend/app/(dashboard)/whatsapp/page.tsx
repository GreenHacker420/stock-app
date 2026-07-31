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
import { ArrowLeft, MessageSquare, RefreshCw } from "lucide-react";

export default function WhatsAppPage() {
  const { token, activeShopId } = useAuthStore();

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ["whatsapp-messages", activeShopId],
    queryFn: () => apiRequest(`/whatsapp/messages?shopId=${activeShopId || ""}`, { token: token || undefined }),
    enabled: !!token,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight">WhatsApp Communications</h1>
            <p className="text-xs text-muted-foreground">Automated invoice receipts, payment reminders, and customer chats.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Recent Sent Messages & Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs">Recipient Phone</TableHead>
                  <TableHead className="text-xs">Message Type</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-xs text-muted-foreground">
                      Loading WhatsApp log...
                    </TableCell>
                  </TableRow>
                ) : Array.isArray(messages) && messages.length > 0 ? (
                  messages.map((msg: any, idx: number) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="font-mono">{msg.recipientPhone}</TableCell>
                      <TableCell>{msg.type || "Invoice Receipt"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50">
                          {msg.status || "SENT"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-xs text-muted-foreground">
                      No WhatsApp messages logged for active shop.
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
