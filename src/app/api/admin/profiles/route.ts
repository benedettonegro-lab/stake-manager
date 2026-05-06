import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase";
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
    const supabase = await createServerSupabaseClient();

    // 1) Verify caller is authenticated via Supabase cookies
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "Non autorizzato" },
        { status: 401 },
      );
    }

    // 2) Fetch caller profile and enforce admin+approved
    const { data: callerProfile, error: callerProfileError } = await supabase
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

    if (
      !callerProfile ||
      callerProfile.role !== "admin" ||
      callerProfile.status !== "approved"
    ) {
      return Response.json(
        { error: "Permessi insufficienti" },
        { status: 403 },
      );
    }

    // 3) Parse and validate body
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

    // 4) Update target profile using service role
    const { url } = getSupabaseEnv();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return Response.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY mancante" },
        { status: 500 },
      );
    }

    const cookieStore = await cookies();
    const adminClient = createServerClient(url, serviceKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route handler: no need to set cookies for service role.
        },
      },
    });

    const { data: updated, error: updateError } = await adminClient
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

