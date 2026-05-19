import { readSessionJsonCache, writeSessionJsonCache } from "@/lib/session-json-cache";

const NS = "session_user";
const KEY = "current";
/** TTL lungo: solo per sbloccare UI con ultimo utente noto. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function readCachedSessionUserId(): string | null {
  const id = readSessionJsonCache<string>(NS, KEY, TTL_MS);
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function writeCachedSessionUserId(userId: string): void {
  writeSessionJsonCache(NS, KEY, userId);
}

export function clearCachedSessionUserId(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`sm_json_${NS}_${KEY}`);
  } catch {
    /* ignore */
  }
}
