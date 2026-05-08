import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendCredentialsEmail } from "../_shared/credentials-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  email: string;
  full_name: string;
  phone?: string | null;
  student_id?: string | null; // optional: link as parent to this student
  student_ids?: string[] | null; // optional: link as parent to multiple students
  password?: string | null;   // if provided, create immediately
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("role, school_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profErr || !callerProfile?.school_id || callerProfile.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Only school admins can create guardians" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: InvitePayload = await req.json();
    if (!body.email || !body.full_name) {
      return new Response(JSON.stringify({ error: "email and full_name are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schoolId = callerProfile.school_id;
    const meta = {
      full_name: body.full_name,
      role: "PARENT",
      school_id: schoolId,
    };

    if (!body.password || body.password.length < 6) {
      return new Response(JSON.stringify({ error: "password obrigatória (mín. 6 caracteres)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createErr) throw createErr;
    const userId = created.user?.id ?? null;

    if (!userId) throw new Error("Failed to create user");

    await admin.from("profiles").update({
      school_id: schoolId,
      role: "PARENT",
      full_name: body.full_name,
      phone: body.phone ?? null,
    }).eq("id", userId);

    // Optionally link as parent on one or many students
    const studentIds: string[] = Array.isArray(body.student_ids) && body.student_ids.length > 0
      ? body.student_ids.filter((s): s is string => typeof s === "string" && !!s)
      : (body.student_id ? [body.student_id] : []);
    if (studentIds.length > 0) {
      await admin.from("students").update({ parent_id: userId }).in("id", studentIds);
    }

    // Send credentials email (fire-and-forget)
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (brevoKey) {
      const { data: school } = await admin.from("schools").select("name").eq("id", schoolId).maybeSingle();
      const origin = req.headers.get("origin") ?? "https://app.edukamba.com";
      void sendCredentialsEmail({
        recipientName: body.full_name,
        recipientEmail: body.email,
        password: body.password,
        loginUrl: `${origin}/auth`,
        schoolName: school?.name ?? "Edukamba",
        brevoKey,
        senderEmail: Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com",
        senderName: Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba",
      });
    }

    return new Response(JSON.stringify({ user_id: userId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invite-guardian error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});