"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function getCallbackUrl() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/callback?next=/dashboard`;
}

function LoginAuthMessage() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("error");
  if (!raw) return null;
  return (
    <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {decodeURIComponent(raw)}
    </p>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getCallbackUrl(),
        },
      });
      if (error) throw error;

      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setMessage(
          "Account created — check your email to confirm before signing in (if confirmations are enabled in Supabase)."
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Second Brain
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in or create an account
          </h1>
          <p className="text-sm text-muted-foreground">
            Email and password authenticate against Supabase. Graph data uses
            RLS with your signed-in identity.
          </p>
          <Suspense fallback={null}>
            <LoginAuthMessage />
          </Suspense>
        </div>

        <div className="flex rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setMessage(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "signin"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setMessage(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "signup"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign up
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(evt) => setEmail(evt.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              minLength={6}
              value={password}
              onChange={(evt) => setPassword(evt.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder={mode === "signin" ? "••••••••" : "At least 6 characters"}
            />
          </div>

          {message ? (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "Working…"
              : mode === "signin"
                ? "Continue to dashboard"
                : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
