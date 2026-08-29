"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchShopsApi, loginApi } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { AlertCircle, Boxes, Command, Loader2, LockKeyhole, ShieldCheck, Store, Workflow } from "lucide-react";

const loginSchema = z.object({
  identifier: z.string().min(1, "Mobile or email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, token, setAuth, setShops } = useAuthStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && token) router.push("/dashboard");
  }, [isAuthenticated, token, router]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const result = await loginApi(data.identifier.trim(), data.password);
      setAuth(result.user, result.token);
      try {
        setShops(await fetchShopsApi(result.token));
      } catch {
        setShops([]);
      }
      router.push("/dashboard");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Invalid mobile/email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="subtle-grid-background relative flex min-h-dvh w-screen items-stretch overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_srgb,var(--accent)_76%,transparent),transparent_28%),radial-gradient(circle_at_82%_72%,color-mix(in_srgb,var(--chart-2)_10%,transparent),transparent_30%)]" />

      <section className="relative hidden min-h-dvh flex-1 flex-col justify-between border-r bg-card/54 p-[clamp(1.5rem,3vw,4.5rem)] lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-[clamp(2.4rem,5vh,3.1rem)] items-center justify-center rounded-xl bg-foreground text-background shadow-lg"><Boxes className="size-5" /></span>
          <div><p className="text-[clamp(0.95rem,1.1vw,1.2rem)] font-semibold tracking-tight">Shop Control</p><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Operations workspace</p></div>
        </div>

        <div className="w-[clamp(22rem,42vw,46rem)]">
          <p className="workspace-kicker">Desktop operations</p>
          <h1 className="mt-3 text-[clamp(2rem,4.6vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-foreground">Fast registers.<br />Real stock.<br />One control surface.</h1>
          <p className="mt-[clamp(1rem,2vh,1.6rem)] w-[clamp(18rem,34vw,38rem)] text-[clamp(0.76rem,0.9vw,1rem)] leading-6 text-muted-foreground">Keyboard-first operations over the same backend contracts, permissions, stock ledger and customer accounts used by the mobile application.</p>
        </div>

        <div className="grid w-[clamp(24rem,46vw,52rem)] grid-cols-3 gap-[clamp(0.5rem,0.8vw,0.9rem)]">
          <ValueChip icon={Command} label="Keyboard first" />
          <ValueChip icon={Workflow} label="Backend aligned" />
          <ValueChip icon={ShieldCheck} label="RBAC enforced" />
        </div>
      </section>

      <section className="relative flex min-h-dvh w-full items-center justify-center p-[clamp(0.85rem,3vw,3rem)] lg:w-[clamp(26rem,38vw,44rem)] lg:shrink-0">
        <Card
          className="w-full overflow-hidden rounded-[clamp(1rem,1.3vw,1.4rem)] border bg-card/92 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur"
          style={{ width: "min(92vw, clamp(19rem, 31vw, 30rem))" }}
        >
          <CardContent className="p-[clamp(1rem,2vw,2rem)]">
            <div className="mb-[clamp(1rem,2.2vh,1.6rem)] lg:hidden">
              <div className="flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background"><Store className="size-4" /></span><div><p className="font-semibold">Shop Control</p><p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Operations workspace</p></div></div>
            </div>

            <div>
              <p className="workspace-kicker">Authorized access</p>
              <h2 className="mt-2 text-[clamp(1.45rem,2vw,2rem)] font-semibold tracking-tight">Sign in to operations</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Use the same account credentials and backend permissions as Shop Control.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-[clamp(1rem,2.5vh,1.7rem)] space-y-[clamp(0.8rem,1.6vh,1.1rem)]">
              {errorMsg ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription className="text-xs">{errorMsg}</AlertDescription></Alert> : null}

              <div className="space-y-1.5">
                <label htmlFor="login-identifier" className="text-xs font-semibold">Mobile number or email</label>
                <Input id="login-identifier" autoComplete="username" placeholder="Enter mobile or email" {...register("identifier")} autoFocus disabled={isLoading} className="h-[clamp(2.5rem,5.2vh,2.9rem)] text-sm" />
                {errors.identifier ? <p className="text-[10px] font-medium text-destructive">{errors.identifier.message}</p> : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-xs font-semibold">Password</label>
                <Input id="login-password" type="password" autoComplete="current-password" placeholder="Enter password" {...register("password")} disabled={isLoading} className="h-[clamp(2.5rem,5.2vh,2.9rem)] text-sm" />
                {errors.password ? <p className="text-[10px] font-medium text-destructive">{errors.password.message}</p> : null}
              </div>

              <Button type="submit" className="h-[clamp(2.55rem,5.3vh,3rem)] w-full gap-2 font-semibold" disabled={isLoading}>
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
                {isLoading ? "Signing in…" : "Open workspace"}
              </Button>
            </form>

            <div className="mt-[clamp(1rem,2vh,1.4rem)] border-t pt-[clamp(0.8rem,1.6vh,1rem)] text-[10px] leading-4 text-muted-foreground">Authentication is verified by the existing backend. The web client does not bypass role, permission, or shop-access checks.</div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function ValueChip({ icon: Icon, label }: { icon: ComponentType<{ className?: string }>; label: string }) {
  return <div className="flex min-h-[clamp(3rem,6vh,4rem)] items-center gap-2 rounded-xl border bg-background/70 px-[clamp(0.65rem,0.9vw,0.9rem)] text-[clamp(0.64rem,0.72vw,0.8rem)] font-medium text-muted-foreground backdrop-blur"><Icon className="size-3.5 text-foreground" /><span>{label}</span></div>;
}
