import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Variabili da `.env.local` (o env deploy):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    );
  }
  return { url, anonKey };
}

/** Ping HTTP all’Auth API (GoTrue) per verificare URL e rete. */
export async function pingSupabaseAuth(): Promise<{
  ok: boolean;
  latencyMs: number;
  detail: string;
}> {
  const { url, anonKey } = getSupabaseEnv();
  const started = Date.now();
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        detail: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    return { ok: true, latencyMs, detail: "Auth /health risponde" };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const detail = e instanceof Error ? e.message : "Errore sconosciuto";
    return { ok: false, latencyMs, detail };
  }
}

const browserClientOptions = {
  isSingleton: true as const,
  cookieOptions: {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce" as const,
  },
};

/**
 * Client browser unico (`isSingleton: true`). Su SSR/prerender Next può essere invocato
 * senza `window`; `@supabase/ssr` gestisce il caso fino al primo uso reale in browser.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey, browserClientOptions);
}

/** @deprecated Usa `getSupabaseBrowserClient()`; mantenuto per compatibilità import. */
export function createBrowserSupabaseClient(): SupabaseClient {
  return getSupabaseBrowserClient();
}
