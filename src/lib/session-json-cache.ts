import { safeArray } from "@/lib/safe-array";

/**
 * Cache JSON in sessionStorage con TTL (offline-safe: fallisce in silenzio se storage assente).
 * Utile per dati di riferimento che possono essere leggermente obsoleti al rientro online.
 */

function key(ns: string, id: string): string {
  return `sm_json_${ns}_${id}`;
}

export function readSessionJsonCache<T>(ns: string, id: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(ns, id));
    if (!raw) return null;
    const row = JSON.parse(raw) as { at?: unknown; payload?: unknown };
    if (typeof row.at !== "number" || row.payload === undefined) return null;
    if (Date.now() - row.at > ttlMs) return null;
    return row.payload as T;
  } catch {
    return null;
  }
}

/** Lettura cache con payload sempre come array (mai assumere shape da JSON). */
export function readSessionJsonCacheArray<T>(
  ns: string,
  id: string,
  ttlMs: number,
): T[] {
  return safeArray<T>(readSessionJsonCache<unknown>(ns, id, ttlMs));
}

export function writeSessionJsonCache<T>(ns: string, id: string, payload: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      key(ns, id),
      JSON.stringify({ at: Date.now(), payload }),
    );
  } catch {
    /* ignore */
  }
}
