"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/lib/auth/auth-store";
import { updateMeApi } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, User, Shield, Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email address").or(z.literal("")).optional(),
  password: z.string().min(4, "Password must be at least 4 characters").or(z.literal("")).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user, token, setAuth } = useAuthStore();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      password: "",
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    if (!token) {
      setErrorMsg("You are not authenticated.");
      return;
    }

    setSuccessMsg(null);
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const updatedUser = await updateMeApi(token, {
        name: data.name,
        email: data.email || null,
        password: data.password || undefined,
      });

      setAuth(updatedUser, token);
      setSuccessMsg("Profile updated successfully!");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight">User Account & Profile</h1>
          <p className="text-xs text-muted-foreground">Manage your personal credentials, contact info, and view system permissions.</p>
        </div>
      </div>

      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">{user?.name || "User Account"}</CardTitle>
                <CardDescription className="text-xs font-mono">{user?.mobile}</CardDescription>
              </div>
            </div>
            <Badge variant={user?.role === "OWNER" ? "default" : "secondary"} className="text-xs">
              {user?.role || "STAFF"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Profile Edit Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Update Credentials</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {successMsg && (
              <Alert className="bg-emerald-50 text-emerald-800 border-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-xs font-semibold">{successMsg}</AlertDescription>
              </Alert>
            )}

            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Full Name</label>
              <Input placeholder="Enter your full name" {...register("name")} className="h-9 text-xs" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Email Address</label>
              <Input placeholder="name@example.com" {...register("email")} className="h-9 text-xs" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">New Password (leave blank to keep current)</label>
              <Input type="password" placeholder="••••••••" {...register("password")} className="h-9 text-xs" />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
          </CardContent>

          <CardFooter className="pt-2 flex justify-end bg-muted/30">
            <Button type="submit" size="sm" className="font-bold h-9" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
