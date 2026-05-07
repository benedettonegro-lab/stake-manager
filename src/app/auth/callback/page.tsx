import { createServerSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AuthCallbackPage(props: { searchParams: SearchParams }) {
  const supabase = await createServerSupabaseClient();
  const searchParams = await props.searchParams;
  const code = typeof searchParams.code === "string" ? searchParams.code : null;

  if (code) {
    // PKCE: scambia il code per una sessione (imposta cookie via middleware).
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Chiudiamo sempre la sessione e mostriamo una pagina neutra.
  await supabase.auth.signOut();

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-lg sm:text-base sm:text-sm text-[#94a3b8]">
      Callback completato. Torna a <a className="underline" href="/login">/login</a>.
    </div>
  );
}

