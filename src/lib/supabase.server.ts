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
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component / Route Handler: scrittura cookie non sempre disponibile;
          // il refresh della sessione è gestito da `middleware.ts`.
        }
        void JSON.stringify(headers);
      },
    },
  });
}
