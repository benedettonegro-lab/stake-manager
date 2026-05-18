import { idbKey, idbRead, idbWrite } from "@/lib/idb-cache";
import { readSessionJsonCache, writeSessionJsonCache } from "@/lib/session-json-cache";

const IDB_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 1000;
const IDB_READ_TIMEOUT_MS = 2_000;

export type SwrResult<T> = {
  data: T | null;
  fromCache: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

/**
 * Lettura cache non bloccante: sessionStorage → IndexedDB (con timeout).
 * Non lancia mai — fallimento cache → { data: null }.
 */
export async function readStaleCache<T>(
  userId: string,
  ns: string,
): Promise<SwrResult<T>> {
  try {
    const session = readSessionJsonCache<T>(ns, userId, SESSION_TTL_MS);
    if (session) return { data: session, fromCache: true };

    const idb = await withTimeout(
      idbRead<T>(idbKey(userId, ns), IDB_TTL_MS),
      IDB_READ_TIMEOUT_MS,
    );
    if (idb) return { data: idb, fromCache: true };
  } catch {
    /* cache miss */
  }

  return { data: null, fromCache: false };
}

/** Applica cache in background — non attendere per la rete. */
export function readStaleCacheSync<T>(
  userId: string,
  ns: string,
): SwrResult<T> {
  const session = readSessionJsonCache<T>(ns, userId, SESSION_TTL_MS);
  if (session) return { data: session, fromCache: true };
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
