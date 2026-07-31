"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/auth-store";
import { apiRequest } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ArrowLeft, Shield, Store, Users, Key } from "lucide-react";

export default function AdministrationPage() {
  const { token, shops } = useAuthStore();

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiRequest("/users/staff", { token: token || undefined }),
    enabled: !!token,
  });

  return (
    <div className="space-y-6">
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
        {/* Shops Directory */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span>Configured Shops</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {shops.map((s) => (
                <div key={s.id} className="p-3 border rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">{s.name}</p>
                    <p className="text-muted-foreground">{s.city} • Code: {s.code}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">Active</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Staff Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Staff Accounts & Roles</span>
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
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-xs text-muted-foreground">
                        Loading staff list...
                      </TableCell>
                    </TableRow>
                  ) : Array.isArray(staffList) && staffList.length > 0 ? (
                    staffList.map((st: any) => (
                      <TableRow key={st.id} className="text-xs">
                        <TableCell className="font-bold">{st.name}</TableCell>
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
                        No staff members found.
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
