import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase";

/**
 * Scambio PKCE / OAuth: scrive i cookie di sessione in Route Handler.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = getSupabaseEnv());
  } catch {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const cookieStore = await cookies();
  let authResponseHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
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
          /* ignore */
        }
        authResponseHeaders = { ...authResponseHeaders, ...headers };
      },
    },
  });

  const applyAuthHeaders = (res: NextResponse) => {
    Object.entries(authResponseHeaders).forEach(([key, value]) => {
      res.headers.set(key, value);
    });
    return res;
  };

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const res = NextResponse.redirect(new URL("/login?reason=callback", origin));
      res.headers.set("Cache-Control", "private, no-store, max-age=0");
      return applyAuthHeaders(res);
    }
    const res = NextResponse.redirect(new URL("/dashboard", origin));
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return applyAuthHeaders(res);
  }

  return NextResponse.redirect(new URL("/login", origin));
}
