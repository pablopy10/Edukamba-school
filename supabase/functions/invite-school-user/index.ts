import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INVITABLE_ROLES = new Set([
  "ADMIN",
  "DIRECTOR",
  "SECRETARY",
  "TREASURER",
  "LIBRARIAN",
  "STOCK_MANAGER",
  "RECEPTIONIST",
  "TEACHER",
]);

interface InvitePayload {
  email: string;
  full_name: string;
  phone?: string | null;
  role: string;
  password?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("role, school_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profErr || !callerProfile?.school_id) {
      return new Response(JSON.stringify({ error: "Perfil inválido" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRole = callerProfile.role as string;
    if (callerRole !== "ADMIN" && callerRole !== "SUPER_ADMIN") {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar utilizadores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: InvitePayload = await req.json();
    const email = body.email?.trim();
    const fullName = body.full_name?.trim();
    const role = body.role?.trim();

    if (!email || !fullName || !role) {
      return new Response(JSON.stringify({ error: "email, full_name e role são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!INVITABLE_ROLES.has(role)) {
      return new Response(JSON.stringify({ error: "Função não permitida para convite" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.password != null && body.password !== "" && (body.password as string).length < 6) {
      return new Response(JSON.stringify({ error: "Password deve ter pelo menos 6 caracteres" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schoolId = callerProfile.school_id;
    const meta = {
      full_name: fullName,
      role,
      school_id: schoolId,
    };
    const redirectTo = `${req.headers.get("origin") ?? ""}/auth`;

    let userId: string | null = null;

    if (body.password && (body.password as string).length >= 6) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: body.password as string,
        email_confirm: true,
        user_metadata: meta,
      });
      if (createErr) throw createErr;
      userId = created.user?.id ?? null;
    } else {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: meta,
        redirectTo,
      });
      if (inviteErr) throw inviteErr;
      userId = invited.user?.id ?? null;
    }

    if (!userId) throw new Error("Failed to create user");

    await admin.from("profiles").upsert({
      id: userId,
      school_id: schoolId,
      role,
      full_name: fullName,
      phone: body.phone ?? null,
      email,
      is_active: true,
    }, { onConflict: "id" });

    return new Response(JSON.stringify({ user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invite-school-user error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
