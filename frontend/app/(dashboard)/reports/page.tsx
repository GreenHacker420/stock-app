"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, FileText, Receipt, Warehouse, Users, CreditCard, ShieldCheck } from "lucide-react";

export default function ReportsPage() {
  const reportCards = [
    { title: "Day Book", desc: "Combined daily sales, collections, and cash movements", href: "/reports/day-book", icon: FileText },
    { title: "Sales Register", desc: "Complete itemized sales invoices and tax breakdown", href: "/sales", icon: Receipt },
    { title: "Stock Summary", desc: "Physical stock levels, valuation, and reorder levels", href: "/inventory", icon: Warehouse },
    { title: "Customer Outstanding", desc: "Customer dues, aging report, and credit limits", href: "/customers", icon: Users },
    { title: "Payment Register", desc: "Daily receipts, UPI transactions, and cheque deposits", href: "/payments", icon: CreditCard },
    { title: "Audit Log", desc: "System activity logs, price edits, and staff actions", href: "/reports/audit-log", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Reports & Analytics</h1>
          <p className="text-xs text-muted-foreground">Tally Prime-inspired operational statements and registers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCards.map((rep) => {
          const IconComp = rep.icon;
          return (
            <Card key={rep.title} className="hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <IconComp className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">{rep.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="text-xs">{rep.desc}</CardDescription>
                <Link href={rep.href}>
                  <Button variant="outline" size="sm" className="w-full text-xs font-bold">
                    View Register
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
