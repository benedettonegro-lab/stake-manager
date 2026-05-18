import { idbKey, idbRead, idbWrite } from "@/lib/idb-cache";
import { readSessionJsonCache, writeSessionJsonCache } from "@/lib/session-json-cache";

const IDB_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 1000;

export type SwrResult<T> = {
  data: T | null;
  fromCache: boolean;
};

/** Stale-while-revalidate: sessionStorage (veloce) → IndexedDB (persistente) → rete. */
export async function readStaleCache<T>(
  userId: string,
  ns: string,
): Promise<SwrResult<T>> {
  const session = readSessionJsonCache<T>(ns, userId, SESSION_TTL_MS);
  if (session) return { data: session, fromCache: true };

  const idb = await idbRead<T>(idbKey(userId, ns), IDB_TTL_MS);
  if (idb) return { data: idb, fromCache: true };

  return { data: null, fromCache: false };
}

export async function writeFreshCache<T>(
  userId: string,
  ns: string,
  payload: T,
): Promise<void> {
  writeSessionJsonCache(ns, userId, payload);
  void idbWrite(idbKey(userId, ns), payload);
}
