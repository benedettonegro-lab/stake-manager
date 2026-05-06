import { createBrowserClient } from "@supabase/ssr";

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

/**
 * Client Supabase per componenti client (`"use client"`).
 * Usa questo file dalla pagina login e da altri client component.
 */
export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
