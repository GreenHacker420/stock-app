"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginApi, fetchShopsApi } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";
import { Store, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

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
    if (isAuthenticated && token) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, token, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await loginApi(data.identifier, data.password);
      setAuth(res.user, res.token);

      // Fetch user's shops
      try {
        const shops = await fetchShopsApi(res.token);
        setShops(shops);
      } catch {
        // Continue even if shops fetch succeeds later
      }

      router.push("/dashboard");
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid mobile/email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md shadow-lg border border-slate-200 dark:border-slate-800">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Store className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Shop Control
          </CardTitle>
          <CardDescription>
            Desktop Operations Console & Dashboard
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Mobile Number / Email
              </label>
              <Input
                placeholder="Enter mobile or email"
                {...register("identifier")}
                autoFocus
                disabled={isLoading}
              />
              {errors.identifier && (
                <p className="text-xs text-destructive font-medium">{errors.identifier.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                {...register("password")}
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-xs text-destructive font-medium">{errors.password.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="pt-2 flex flex-col space-y-3">
            <Button type="submit" className="w-full font-bold h-10" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Sign In to Dashboard
                </>
              )}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Secure desktop connection. Reuses existing backend permissions.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
