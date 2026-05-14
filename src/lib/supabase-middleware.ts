import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase";

/** Errori auth che indicano refresh token non valido o sessione non recuperabile. */
function isRecoverableAuthFailure(message: string | undefined, code: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  const c = (code ?? "").toLowerCase();
  return (
    m.includes("invalid refresh token") ||
    m.includes("refresh token not found") ||
    m.includes("jwt expired") ||
    m.includes("session_not_found") ||
    c === "refresh_token_not_found" ||
    c === "invalid_grant"
  );
}

/**
 * Aggiorna la sessione Supabase su ogni richiesta (refresh token → cookie).
 * Deve essere usato da `middleware.ts` con un matcher che esclude solo asset statici.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = getSupabaseEnv());
  } catch {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const { error } = await supabase.auth.getUser();

  if (error && isRecoverableAuthFailure(error.message, (error as { code?: string }).code)) {
    await supabase.auth.signOut();
  }

  return supabaseResponse;
}
