import { createServerSupabaseClient } from "@/lib/supabase.server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AuthCallbackPage(props: { searchParams: SearchParams }) {
  const supabase = await createServerSupabaseClient();
  const searchParams = await props.searchParams;
  const code = typeof searchParams.code === "string" ? searchParams.code : null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect("/login?reason=callback");
    }
    redirect("/dashboard");
  }

  redirect("/login");
}
