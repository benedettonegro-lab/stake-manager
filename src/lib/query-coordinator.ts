/**
 * Cache in-memory + deduplica richieste identiche (stesso key).
 */

const DEFAULT_TTL_MS = 45_000;

type CacheEntry<T> = {
  data: T;
  at: number;
};

const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function queryCacheKey(parts: string[]): string {
  return parts.join(":");
}

export function readMemoryCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    memory.delete(key);
    return null;
  }
  return hit.data as T;
}

export function writeMemoryCache<T>(key: string, data: T): void {
  memory.set(key, { data, at: Date.now() });
}

export function invalidateMemoryCache(prefix: string): void {
  for (const k of memory.keys()) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
}

/**
 * Esegue `fn` una sola volta per key in flight; riusa cache se fresca.
 */
export async function dedupeFetch<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  if (!opts?.force) {
    const cached = readMemoryCache<T>(key, ttl);
    if (cached !== null) return cached;
  }

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const promise = fn()
    .then((data) => {
      writeMemoryCache(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
