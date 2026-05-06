import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase.server";

type ProfileRole = "admin" | "user";
type ProfileStatus = "pending" | "approved" | "blocked";

type PatchBody = {
  id?: unknown;
  status?: unknown;
  role?: unknown;
};

function isProfileStatus(value: unknown): value is ProfileStatus {
  return value === "pending" || value === "approved" || value === "blocked";
}

function isProfileRole(value: unknown): value is ProfileRole {
  return value === "user" || value === "admin";
}

export async function PATCH(request: Request) {
  try {
    const authSupabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } = await authSupabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "Non autorizzato" },
        { status: 401 },
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      return Response.json(
        { error: "NEXT_PUBLIC_SUPABASE_URL mancante" },
        { status: 500 },
      );
    }

    if (!serviceKey) {
      return Response.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY mancante. Imposta la variabile d'ambiente per abilitare l'accesso admin a public.profiles.",
        },
        { status: 500 },
      );
    }

    const supabaseAdmin = createClient(url, serviceKey);

    // Parse and validate body
    const body = (await request.json()) as PatchBody;
    const id = typeof body.id === "string" ? body.id : null;
    const status = body.status;
    const role = body.role;

    if (!id) {
      return Response.json(
        { error: "Campo id non valido" },
        { status: 400 },
      );
    }

    const update: Partial<{ status: ProfileStatus; role: ProfileRole }> = {};

    if (status !== undefined) {
      if (!isProfileStatus(status)) {
        return Response.json(
          { error: "Status non valido" },
          { status: 400 },
        );
      }
      update.status = status;
    }

    if (role !== undefined) {
      if (!isProfileRole(role)) {
        return Response.json(
          { error: "Role non valido" },
          { status: 400 },
        );
      }
      update.role = role;
    }

    if (Object.keys(update).length === 0) {
      return Response.json(
        { error: "Nessun campo da aggiornare" },
        { status: 400 },
      );
    }

    // Fetch caller profile and enforce admin+approved (service role client)
    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfileError) {
      return Response.json(
        { error: callerProfileError.message },
        { status: 500 },
      );
    }

    if (!callerProfile) {
      return Response.json(
        { error: "Permessi insufficienti" },
        { status: 403 },
      );
    }

    if (callerProfile.role !== "admin" || callerProfile.status !== "approved") {
      return Response.json(
        { error: "Permessi insufficienti" },
        { status: 403 },
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", id)
      .select("id, email, role, status")
      .maybeSingle();

    if (updateError) {
      return Response.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    if (!updated) {
      return Response.json(
        { error: "Profilo non trovato" },
        { status: 404 },
      );
    }

    return Response.json({ profile: updated }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore sconosciuto";
    return Response.json({ error: message }, { status: 500 });
  }
}

