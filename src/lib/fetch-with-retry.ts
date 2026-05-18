import { isLikelyOfflineOrNetworkError } from "@/lib/supabase-network";

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

/** Esegue un async job con timeout e retry esponenziale su errori di rete. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? 25_000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t =
          typeof window !== "undefined"
            ? window.setTimeout(() => reject(new Error("timeout")), timeoutMs)
            : setTimeout(() => reject(new Error("timeout")), timeoutMs);
        void t;
      });
      return await Promise.race([fn(), timeoutPromise]);
    } catch (e) {
      lastError = e;
      const retryable =
        isLikelyOfflineOrNetworkError(e) ||
        (e instanceof Error && e.message === "timeout");
      if (!retryable || attempt === retries) break;
      await new Promise((r) => {
        if (typeof window !== "undefined") {
          window.setTimeout(r, baseDelayMs * 2 ** attempt);
        } else {
          setTimeout(r, baseDelayMs * 2 ** attempt);
        }
      });
    }
  }
  throw lastError;
}
