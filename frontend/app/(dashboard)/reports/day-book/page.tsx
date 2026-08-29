"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { formatINR, formatDate } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, RefreshCw } from "lucide-react";

interface DayBookEntry { id?: string; date?: string; createdAt?: string; salesCount?: number; totalCollections?: number | string; totalExpenses?: number | string; netCash?: number | string }

export default function DayBookPage() {
  const { token, activeShopId } = useAuthStore();
  const { data: dayBookEntries = [], isLoading, refetch } = useQuery<DayBookEntry[]>({ queryKey: ["day-book", activeShopId], queryFn: () => apiRequest<DayBookEntry[]>(`/daily-summary?shopId=${activeShopId || ""}`, { token: token || undefined }), enabled: !!token });
  return <div className="space-y-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Link href="/reports"><Button variant="ghost" size="icon" className="h-9 w-9"><ArrowLeft className="h-4 w-4" /></Button></Link><div><h1 className="text-2xl font-black tracking-tight">Day Book Statement</h1><p className="text-xs text-muted-foreground">Comprehensive record of daily transactions across sales, collections, and payouts.</p></div></div><Button variant="outline" size="sm" onClick={() => void refetch()} className="h-9 gap-1 text-xs"><RefreshCw className="h-3.5 w-3.5" /><span>Refresh</span></Button></div><Card><CardHeader><CardTitle className="text-sm font-bold">Daily Transaction Register</CardTitle></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-right text-xs">Sales Invoices</TableHead><TableHead className="text-right text-xs">Collections (₹)</TableHead><TableHead className="text-right text-xs">Expenses (₹)</TableHead><TableHead className="text-right text-xs">Net Cash Movement (₹)</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">Loading Day Book...</TableCell></TableRow> : dayBookEntries.length > 0 ? dayBookEntries.map((row, index) => <TableRow key={row.id || `${row.date || row.createdAt || "day"}-${index}`} className="text-xs"><TableCell className="font-semibold">{formatDate(row.date || row.createdAt || "")}</TableCell><TableCell className="text-right font-mono">{row.salesCount || 0}</TableCell><TableCell className="text-right font-mono font-bold text-emerald-600">{formatINR(row.totalCollections ?? 0)}</TableCell><TableCell className="text-right font-mono text-rose-600">{formatINR(row.totalExpenses ?? 0)}</TableCell><TableCell className="text-right font-black">{formatINR(row.netCash ?? 0)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">No Day Book entries found for active shop.</TableCell></TableRow>}</TableBody></Table></div></CardContent></Card></div>;
}
