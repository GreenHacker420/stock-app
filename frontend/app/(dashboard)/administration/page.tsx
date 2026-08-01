"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, Shield, Store, Users, Key, CheckCircle2 } from "lucide-react";

export default function AdministrationPage() {
  const { user, shops } = useAuthStore();

  const staffMembers = user
    ? [
        {
          id: user.id || "1",
          name: user.name,
          mobile: user.mobile,
          role: user.role || "OWNER",
          status: "ACTIVE",
        },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Shop & Staff Administration</h1>
          <p className="text-xs text-muted-foreground">Manage shop profiles, staff accounts, roles, and granular permissions.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configured Shops Directory */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span>Configured Outlets & Outlets</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shops.map((s) => (
                <div key={s.id} className="p-3 border rounded-lg flex items-center justify-between text-xs bg-card">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">{s.name}</p>
                    <p className="text-muted-foreground">{s.city} • Code: {s.code}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 border-emerald-200">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Staff Accounts & Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Active Staff Accounts & Roles</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs">Staff Name</TableHead>
                    <TableHead className="text-xs">Mobile</TableHead>
                    <TableHead className="text-xs text-center">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffMembers.length > 0 ? (
                    staffMembers.map((st: any) => (
                      <TableRow key={st.id} className="text-xs">
                        <TableCell className="font-bold text-slate-900 dark:text-slate-100">{st.name}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{st.mobile}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={st.role === "OWNER" ? "default" : "secondary"} className="text-[10px]">
                            {st.role}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-xs text-muted-foreground">
                        No active staff members logged in.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
