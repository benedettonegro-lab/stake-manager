import type { SupabaseClient, User } from "@supabase/supabase-js";

const SESSION_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    promise
      .then((v) => {
        clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

/**
 * Sessione utente: prima getSession (locale/veloce), poi getUser se necessario.
 * Una sola risoluzione per mount — non bloccare su refresh infiniti.
 */
export async function resolveAppSession(
  supabase: SupabaseClient,
): Promise<{ user: User | null; error: string | null }> {
  try {
    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      SESSION_TIMEOUT_MS,
      "getSession",
    );

    if (sessionError) {
      return { user: null, error: sessionError.message };
    }

    const sessionUser = sessionData.session?.user ?? null;
    if (sessionUser) {
      return { user: sessionUser, error: null };
    }

    const { data: userData, error: userError } = await withTimeout(
      supabase.auth.getUser(),
      SESSION_TIMEOUT_MS,
      "getUser",
    );

    if (userError) {
      return { user: null, error: userError.message };
    }

    return { user: userData.user ?? null, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sessione non disponibile";
    return { user: null, error: msg };
  }
}
