"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Save, ShieldCheck, UserRound } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceMetric, WorkspaceMetricGrid } from "@/components/workspace/WorkspaceMetrics";
import { WorkspacePage, WorkspacePageHeader, WorkspacePanel } from "@/components/workspace/WorkspacePage";
import { updateMeApi } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
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
    resetField,
    formState: { errors, isDirty },
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
      setErrorMsg("Your session is no longer available. Sign in again before updating the profile.");
      return;
    }

    setSuccessMsg(null);
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const updatedUser = await updateMeApi(token, {
        name: data.name.trim(),
        email: data.email?.trim() || null,
        password: data.password || undefined,
      });

      setAuth(updatedUser, token);
      resetField("password", { defaultValue: "" });
      setSuccessMsg("Profile changes were saved.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Profile update failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const permissionCount = user?.permissions?.length ?? 0;

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        kicker="Account · Identity"
        title="My profile"
        description="Update the account fields supported by PATCH /auth/me and review the role and permission scope returned by the authenticated session."
        icon={UserRound}
      />

      <WorkspaceMetricGrid>
        <WorkspaceMetric label="Role" value={user?.role || "—"} detail="Backend-issued account role" icon={ShieldCheck} tone="info" />
        <WorkspaceMetric label="Permissions" value={permissionCount} detail="Explicit permissions in current session" icon={KeyRound} />
        <WorkspaceMetric label="Mobile" value={user?.mobile || "—"} detail="Login/mobile identifier" icon={UserRound} />
        <WorkspaceMetric label="Form state" value={isDirty ? "Unsaved" : "Saved"} detail={isDirty ? "Changes have not been submitted" : "No local changes pending"} icon={Save} tone={isDirty ? "warning" : "success"} />
      </WorkspaceMetricGrid>

      <div className="workspace-two-column">
        <WorkspacePanel title="Account identity" description="Mobile and role are intentionally read-only here because the self-service API does not allow them to be changed.">
          <div className="p-[clamp(0.75rem,1vw,1rem)]">
            <div className="flex items-center gap-3 rounded-xl border bg-muted/25 p-[clamp(0.8rem,1vw,1rem)]">
              <div className="flex size-[clamp(2.75rem,6vh,3.5rem)] shrink-0 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
                <UserRound className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[clamp(0.9rem,1vw,1.05rem)] font-semibold">{user?.name || "User account"}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{user?.mobile || "No mobile"}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{user?.email || "No email configured"}</p>
              </div>
              <Badge variant={user?.role === "OWNER" ? "default" : "secondary"} className="text-[9px]">{user?.role || "STAFF"}</Badge>
            </div>

            <div className="mt-3 rounded-xl border bg-card p-[clamp(0.75rem,1vw,1rem)]">
              <p className="workspace-kicker">Authorization</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Frontend actions are filtered using the permissions in this session, while every API write remains protected by backend RBAC and shop-access checks.
              </p>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspacePanel title="Update credentials" description="Only name, email and an optional replacement password are sent to the backend.">
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-full flex-col">
            <div className="flex-1 space-y-[clamp(0.8rem,1.4vh,1.1rem)] p-[clamp(0.75rem,1vw,1rem)]">
              {successMsg ? <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="size-4" /><AlertDescription className="text-xs font-medium">{successMsg}</AlertDescription></Alert> : null}
              {errorMsg ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{errorMsg}</AlertDescription></Alert> : null}

              <div className="space-y-1.5">
                <label htmlFor="profile-name" className="text-xs font-semibold">Full name</label>
                <Input id="profile-name" autoComplete="name" placeholder="Enter your full name" {...register("name")} className="h-[var(--workspace-control-height)] text-xs" />
                {errors.name ? <p className="text-[10px] font-medium text-destructive">{errors.name.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-email" className="text-xs font-semibold">Email address</label>
                <Input id="profile-email" type="email" autoComplete="email" placeholder="name@example.com" {...register("email")} className="h-[var(--workspace-control-height)] text-xs" />
                {errors.email ? <p className="text-[10px] font-medium text-destructive">{errors.email.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="profile-password" className="text-xs font-semibold">New password</label>
                <Input id="profile-password" type="password" autoComplete="new-password" placeholder="Leave blank to keep the current password" {...register("password")} className="h-[var(--workspace-control-height)] text-xs" />
                {errors.password ? <p className="text-[10px] font-medium text-destructive">{errors.password.message}</p> : null}
              </div>
            </div>

            <div className="flex justify-end border-t bg-muted/20 p-[clamp(0.7rem,1vw,1rem)]">
              <Button type="submit" size="sm" className="h-9 gap-1.5 font-semibold" disabled={isSubmitting || !isDirty}>
                {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
