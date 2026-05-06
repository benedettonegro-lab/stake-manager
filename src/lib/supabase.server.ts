import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./supabase";

/**
 * Client Supabase per Server Components, Server Actions e Route Handlers.
 * Importa solo da file Server (`"server-only"` implicito: usa `next/headers`).
 */
export async function createServerSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component: il refresh sessione avviene nel middleware.
        }
      },
    },
  });
}
