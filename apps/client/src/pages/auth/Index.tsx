import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { readResponseBody, normalizeApiError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Reference auth page — wired to the rules in AGENTS.md (### Auth). This is an
 * EXAMPLE to copy/adapt for your product; keep the navigation pattern intact.
 *
 * It demonstrates the three things generated login pages usually get wrong:
 *   1. Tri-state session gating — wait for the session check (loading) before
 *      deciding. Never treat "loading" as "guest", or the first paint after
 *      login bounces the authenticated user straight back here.
 *   2. Reverse guard — an already-authenticated user is redirected away from
 *      /auth instead of being shown the login form again.
 *   3. On success, navigate with the router. NEVER call
 *      window.location.reload(): this is a client-side-routed SPA, so a reload
 *      just re-renders THIS login route and strands the user ("logs in but
 *      bounces back to login"). The Bearer token is already persisted by
 *      lib/auth.ts.
 *
 * Protecting other routes is the mirror image: gate them on the same
 * loading / authed / guest tri-state and redirect guests to "/auth".
 */
const AuthPage = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  const verificationEmail =
    pendingVerificationEmail || (!session?.user?.emailVerified ? session?.user?.email ?? "" : "");
  const resendWaitSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  useEffect(() => {
    if (resendAvailableAt <= now) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [now, resendAvailableAt]);

  // (1) Loading: the token-based session check has not resolved yet.
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // (2) Reverse guard: verified users leave the login route. Keep signed-in
  // but unverified users here so the verification-code form cannot be skipped
  // by a fast session refresh after sign-up.
  if (session?.user?.emailVerified && !verificationEmail) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        throw new Error(result.error.message ?? "Authentication failed");
      }

      if (mode === "signup") {
        await sendVerificationCode();
        setPendingVerificationEmail(email);
        toast.success("Verification code sent");
        return;
      }

      toast.success("Signed in");
      // (3) Navigate via the router. Do NOT window.location.reload().
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const sendVerificationCode = async () => {
    const response = await apiFetch("/api/email-verification/send-code", {
      method: "POST",
      auth: true
    });
    if (!response.ok) {
      const body = await readResponseBody(response);
      const retryAfterSeconds =
        body && typeof body === "object" && "data" in body
          ? Number((body.data as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds ?? 0)
          : 0;
      if (retryAfterSeconds > 0) {
        setNow(Date.now());
        setResendAvailableAt(Date.now() + retryAfterSeconds * 1000);
      }
      throw new Error(normalizeApiError(body).message);
    }
    setNow(Date.now());
    setResendAvailableAt(Date.now() + 60 * 1000);
  };

  const onVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiFetch("/api/email-verification/verify-code", {
        method: "POST",
        auth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode })
      });
      if (!response.ok) {
        throw new Error(normalizeApiError(await readResponseBody(response)).message);
      }

      toast.success("Email verified");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onResendCode = async () => {
    setSubmitting(true);
    try {
      await sendVerificationCode();
      toast.success("Verification code resent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend code");
    } finally {
      setSubmitting(false);
    }
  };

  if (verificationEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Verify your email</CardTitle>
            <CardDescription>Enter the 6-digit code sent to {verificationEmail}.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onVerifyCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="verification-code">Verification code</Label>
                <Input
                  id="verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting || verificationCode.length !== 6}>
                {submitting ? "Please wait..." : "Verify email"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={submitting || resendWaitSeconds > 0}
                onClick={onResendCode}
              >
                {resendWaitSeconds > 0 ? `Resend in ${resendWaitSeconds}s` : "Resend code"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "signup" ? "Create account" : "Welcome back"}</CardTitle>
          <CardDescription>
            {mode === "signup" ? "Sign up to get started." : "Sign in to your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "signin" | "signup")}
            className="mb-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "signup" ? "Sign up" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
