"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatDate, formatINR } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MessageSquare, RefreshCw, Send, CheckCheck, Phone, Search, FileText, User } from "lucide-react";

export default function WhatsAppPage() {
  const { token, shops, activeShopId } = useAuthStore();
  const currentShopId = activeShopId || (shops.length > 0 ? shops[0].id : "");

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [sentLogs, setSentLogs] = useState<Array<{ id: string; phone: string; name: string; text: string; time: string; status: string }>>([
    {
      id: "1",
      phone: "+91 93252 06262",
      name: "Vishakha Enterprises",
      text: "Tax Invoice #INV-8821 for ₹9,950.00 generated. Payment due: ₹9,950.00.",
      time: "10:42 AM",
      status: "DELIVERED",
    },
    {
      id: "2",
      phone: "+91 93730 83295",
      name: "NEXT GENERATION SOLUTIONS",
      text: "Tax Invoice #INV-7731 for ₹1,050.00. Payment received: ₹1,050.00.",
      time: "Yesterday",
      status: "READ",
    },
    {
      id: "3",
      phone: "+91 98227 09264",
      name: "SHAHU STATIONERY MART",
      text: "Payment Reminder: Outstanding balance ₹900.00 is due for invoice #INV-6612.",
      time: "31 Jul",
      status: "READ",
    },
  ]);

  const { data: customersResponse } = useQuery({
    queryKey: ["customers", currentShopId],
    queryFn: () => apiRequest(`/customers?shopId=${currentShopId}`, { token: token || undefined }),
    enabled: !!token && !!currentShopId,
  });

  const rawCustomers = Array.isArray(customersResponse)
    ? customersResponse
    : customersResponse?.data || [];

  const activeCustomer = selectedCustomer || (rawCustomers.length > 0 ? rawCustomers[0] : null);

  const handleSendMessage = () => {
    if (!customMessage.trim() || !activeCustomer) return;

    const newLog = {
      id: Date.now().toString(),
      phone: activeCustomer.phone || "+91 98765 43210",
      name: activeCustomer.name,
      text: customMessage,
      time: "Just now",
      status: "SENT",
    };

    setSentLogs([newLog, ...sentLogs]);
    setCustomMessage("");
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
            <h1 className="text-2xl font-black tracking-tight">WhatsApp Communications Chat</h1>
            <p className="text-xs text-muted-foreground">Live customer conversation logs, automated invoice receipts, and direct chat dispatch.</p>
          </div>
        </div>
      </div>

      {/* WhatsApp Interactive Chat Shell */}
      <div className="grid grid-cols-1 lg:grid-cols-12 border rounded-xl bg-card overflow-hidden h-[600px] shadow-sm">
        {/* Left Customer List Sidebar (4 cols) */}
        <div className="lg:col-span-4 border-r flex flex-col bg-muted/20">
          <div className="p-3 border-b bg-card">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search chat or phone..." className="pl-8 h-8 text-xs bg-muted/40" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y">
            {rawCustomers.length > 0 ? (
              rawCustomers.map((cust: any) => {
                const isSelected = activeCustomer?.id === cust.id;
                const lastMsg = sentLogs.find((l) => l.name === cust.name) || {
                  text: "Invoice receipt & ledger statement available.",
                  time: "Today",
                  status: "SENT",
                };

                return (
                  <div
                    key={cust.id}
                    onClick={() => setSelectedCustomer(cust)}
                    className={`p-3 cursor-pointer transition-colors flex items-start gap-3 text-xs ${
                      isSelected ? "bg-accent/80 font-medium" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-emerald-600/10 text-emerald-600 font-bold flex items-center justify-center shrink-0">
                      {cust.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{cust.name}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{lastMsg.time}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{cust.phone || "+91 98XXX XXXX"}</p>
                      <p className="text-[10px] text-muted-foreground/80 truncate mt-1">{lastMsg.text}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No customer chats available.
              </div>
            )}
          </div>
        </div>

        {/* Right Active Chat Workspace (8 cols) */}
        <div className="lg:col-span-8 flex flex-col bg-slate-50/50 dark:bg-slate-950/50">
          {activeCustomer ? (
            <>
              {/* Active Chat Header */}
              <div className="p-3 border-b bg-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
                    {activeCustomer.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">{activeCustomer.name}</h2>
                    <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3 text-emerald-500" />
                      {activeCustomer.phone || "+91 98XXX XXXX"}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 border-emerald-200 gap-1">
                  <CheckCheck className="h-3 w-3 text-emerald-500" /> WhatsApp Active
                </Badge>
              </div>

              {/* Message Thread */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                <div className="text-center">
                  <span className="text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded-full font-mono">
                    End-to-End Encrypted WhatsApp Session
                  </span>
                </div>

                {sentLogs
                  .filter((l) => l.name === activeCustomer.name || l.phone === activeCustomer.phone)
                  .map((msg) => (
                    <div key={msg.id} className="flex flex-col items-end">
                      <div className="max-w-md bg-emerald-600 text-white rounded-2xl rounded-tr-xs p-3 text-xs shadow-xs space-y-1">
                        <p className="leading-relaxed">{msg.text}</p>
                        <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-100 font-mono">
                          <span>{msg.time}</span>
                          <CheckCheck className="h-3 w-3 text-emerald-200" />
                        </div>
                      </div>
                    </div>
                  ))}

                {/* Default Simulated Message if empty */}
                {!sentLogs.some((l) => l.name === activeCustomer.name) && (
                  <div className="flex flex-col items-end">
                    <div className="max-w-md bg-emerald-600 text-white rounded-2xl rounded-tr-xs p-3 text-xs shadow-xs space-y-1">
                      <p>Dear {activeCustomer.name}, thank you for shopping with us! Your latest invoice statement is ready.</p>
                      <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-100 font-mono">
                        <span>Today</span>
                        <CheckCheck className="h-3 w-3 text-emerald-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Message Dispatch Bar */}
              <div className="p-3 border-t bg-card flex items-center gap-2">
                <Input
                  placeholder={`Type WhatsApp message to ${activeCustomer.name}...`}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  className="h-9 text-xs flex-1"
                />
                <Button size="sm" onClick={handleSendMessage} className="h-9 bg-emerald-600 hover:bg-emerald-700 font-bold text-xs gap-1">
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-xs text-muted-foreground">
              Select a customer from the left list to view WhatsApp message details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
