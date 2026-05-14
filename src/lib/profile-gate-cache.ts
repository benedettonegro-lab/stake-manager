const STORAGE_KEY = "sm_profile_gate_v1";
const TTL_MS = 3 * 60 * 1000;

type CacheEntry = { userId: string; at: number };

function readRaw(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const userId = (parsed as { userId?: unknown }).userId;
    const at = (parsed as { at?: unknown }).at;
    if (typeof userId !== "string" || typeof at !== "number") return null;
    return { userId, at };
  } catch {
    return null;
  }
}

/** True se l’utente era approvato in cache ancora valida (riduce flicker / round-trip). */
export function readProfileApprovedCache(userId: string): boolean {
  const e = readRaw();
  if (!e || e.userId !== userId) return false;
  return Date.now() - e.at < TTL_MS;
}

export function writeProfileApprovedCache(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userId, at: Date.now() } satisfies CacheEntry),
    );
  } catch {
    /* quota / private mode */
  }
}

export function clearProfileGateCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
