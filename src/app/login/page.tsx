"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type LoadingState = "signin" | "signup" | null;

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>(null);
  const [reasonMessage, setReasonMessage] = useState<string | null>(null);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");

    if (reason === "pending") {
      setReasonMessage("Account in attesa di approvazione admin");
    } else if (reason === "blocked") {
      setReasonMessage("Account bloccato");
    } else if (reason === "missing-profile") {
      setReasonMessage("Profilo non trovato. Contatta admin.");
    } else {
      setReasonMessage(null);
    }
  }, []);

  const handleSignIn = async () => {
    setLoading("signin");
    setError(null);
    setInfo(null);

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !data.user) {
      setError("Credenziali non valide");
      setLoading(null);
      return;
    }

    console.log("[LOGIN] user id:", data.user?.id);
    console.log("[LOGIN] user email:", data.user?.email);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, status")
      .eq("id", data.user.id)
      .maybeSingle();

    console.log("[LOGIN] profile:", profile);
    console.log("[LOGIN] profile error:", profileError);

    if (profileError) {
      await supabase.auth.signOut();
      setError(`Errore profilo: ${profileError.message}`);
      setLoading(null);
      return;
    }

    if (!profile) {
      await supabase.auth.signOut();
      setError(`Profilo non trovato per user id: ${data.user.id}`);
      setLoading(null);
      return;
    }

    if (profile.status !== "approved") {
      await supabase.auth.signOut();
      setError("Account in attesa di approvazione admin");
      setLoading(null);
      return;
    }

    router.push("/dashboard");
  };

  const handleSignUp = async () => {
    setLoading("signup");
    setError(null);
    setInfo(null);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(null);
      return;
    }

    await supabase.auth.signOut();

    setInfo("Account creato. Attendi approvazione admin.");
    setLoading(null);
  };

  return (
    <div className="min-h-screen bg-[#070B14] px-5 py-12 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-10 text-center">
          <p className="mb-4 text-lg sm:text-base sm:text-sm font-bold uppercase tracking-[0.35em] text-[#a855f7]">
            Stake Manager
          </p>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-4xl sm:font-black">
            Accedi al tuo account
          </h1>
          <p className="mt-4 text-[15px] text-[#94a3b8] sm:text-lg">
            Email e password per continuare.
          </p>
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
            onSubmit={(event) => {
              event.preventDefault();
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
                onChange={(event) => setEmail(event.target.value)}
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
                onChange={(event) => setPassword(event.target.value)}
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
                className="sm-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
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