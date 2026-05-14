"use client";

import { AppCard } from "@/components/app";
import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const links = [
  { href: "/bookmakers", label: "Bookmakers", hint: "Elenco quote" },
  { href: "/movimenti", label: "Movimenti", hint: "Report" },
] as const;

function formatItDateDdMmYyyy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export default function AltroPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [registeredOn, setRegisteredOn] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setEmail(null);
        setRegisteredOn(null);
        setLoading(false);
        return;
      }

      setEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setRegisteredOn(formatItDateDdMmYyyy(profile?.created_at as string | undefined));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/login?reason=session");
  }, [router, supabase]);

  return (
    <AuthGate>
      <AppShell title="Altro">
        <ul className="flex flex-col gap-2 p-0">
          {links.map((item) => (
            <li key={item.href}>
              <AppCard href={item.href} padding="sm" className="!rounded-xl">
                <p className="text-xl font-semibold text-white sm:text-sm">{item.label}</p>
                <p className="mt-0.5 text-sm sm:text-xs text-[#8B93A7]">{item.hint}</p>
              </AppCard>
            </li>
          ))}

          <li>
            <AppCard padding="sm" className="!rounded-xl">
              <p className="text-xl font-semibold text-white sm:text-sm">Account</p>
              <p className="mt-0.5 text-sm sm:text-xs text-[#8B93A7]">Profilo</p>

              {loading ? (
                <p className="mt-3 text-lg sm:text-base text-[#8B93A7] sm:text-sm">Caricamento…</p>
              ) : (
                <>
                  <p className="mt-3 break-all text-lg sm:text-base text-[#8B93A7] sm:text-sm">
                    {email ?? "—"}
                  </p>
                  {registeredOn ? (
                    <p className="mt-1 text-lg sm:text-base text-[#8B93A7] sm:text-sm">
                      Registrazione: {registeredOn}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={() => void handleLogout()}
                    className="mt-3 w-full rounded-lg border border-white/[0.06] bg-[#131C31] px-4 py-3 text-lg sm:text-base font-semibold text-[#e2e8f0] transition active:scale-[0.99] hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    {loggingOut ? "Uscita…" : "Logout"}
                  </button>
                </>
              )}
            </AppCard>
          </li>
        </ul>
      </AppShell>
    </AuthGate>
  );
}
