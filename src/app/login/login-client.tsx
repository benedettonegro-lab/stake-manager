"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState<"signin" | "signup" | null>(null);

  const reason = searchParams.get("reason");
  const reasonMessage =
    reason === "pending"
      ? "Account in attesa di approvazione admin"
      : reason === "blocked"
        ? "Account bloccato."
        : reason === "missing-profile"
          ? "Profilo non trovato. Contatta admin."
          : null;

  async function checkProfileStatusAfterAuth(): Promise<
    | { ok: true }
    | { ok: false; reason: "pending" | "blocked" | "missing-profile" }
  > {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { ok: false, reason: "pending" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) return { ok: false, reason: "missing-profile" };

    const status = (profile.status as string | null) ?? null;
    if (status === "approved") return { ok: true };
    if (status === "blocked") return { ok: false, reason: "blocked" };
    return { ok: false, reason: "pending" };
  }

  async function handleSignIn() {
    setError(null);
    setInfo(null);
    setLoading("signin");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(null);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    const gate = await checkProfileStatusAfterAuth();
    if (!gate.ok) {
      await supabase.auth.signOut();
      setError("Account in attesa di approvazione admin");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignUp() {
    setError(null);
    setInfo(null);
    setLoading("signup");
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(null);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      await supabase.auth.signOut();
    }

    setInfo("Account creato. Attendi approvazione admin.");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-[#070B14] px-3 py-12 sm:px-4 sm:py-16">
      <div className="sm-app-constrain w-full">
        <div className="mb-8 text-center">
          <p className="text-sm sm:text-xs font-semibold uppercase tracking-[0.25em] sm-gradient-text">
            Stake Manager
          </p>
          <h1 className="mt-3 text-[26px] font-bold tracking-tight text-[#E6EAF2] sm:text-2xl sm:font-semibold">
            Accedi al tuo account
          </h1>
          <p className="mt-2 text-[14px] text-[#94a3b8] sm:text-base sm:text-sm">Email e password per continuare.</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1525] p-5 shadow-md shadow-black/25 sm:p-6">
          {reasonMessage ? (
            <p
              className="mb-4 rounded-xl border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-lg sm:text-base sm:text-sm text-[#fdba74]"
              role="status"
            >
              {reasonMessage}
            </p>
          ) : null}
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSignIn();
            }}
          >
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
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
                onChange={(e) => setEmail(e.target.value)}
                className="sm-input"
                placeholder="nome@esempio.com"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-sm sm:text-xs font-medium uppercase tracking-wide text-[#94a3b8]"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sm-input"
                placeholder="••••••••"
              />
            </div>

            {error ? (
              <p
                className="rounded-xl border border-[#fb7185]/40 bg-[#fb7185]/10 px-3 py-2 text-lg sm:text-base sm:text-sm text-[#fb7185]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {info ? (
              <p
                className="rounded-xl border border-[#34d399]/35 bg-[#34d399]/10 px-3 py-2 text-lg sm:text-base sm:text-sm text-[#a7f3d0]"
                role="status"
              >
                {info}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 pt-1">
              <button
                type="submit"
                disabled={loading !== null}
                className="sm-btn-primary w-full disabled:cursor-not-allowed"
              >
                {loading === "signin" ? "Accesso…" : "Accedi"}
              </button>
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => void handleSignUp()}
                className="flex min-h-12 w-full items-center justify-center rounded-xl border border-white/[0.08] bg-[#151d2e] px-4 text-lg sm:text-base font-semibold text-white transition-colors hover:border-[#a855f7]/28 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === "signup" ? "Registrazione…" : "Registrati"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-8 text-center text-lg sm:text-base sm:text-sm text-[#94a3b8]">
          <Link
            href="/dashboard"
            className="font-medium text-[#a855f7] underline-offset-4 hover:underline"
          >
            Torna alla home
          </Link>
        </p>
      </div>
    </div>
  );
}

