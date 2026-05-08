import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendCredentialsEmail } from "../_shared/credentials-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvitePayload {
  email: string;
  full_name: string;
  phone?: string;
  subject_id?: string | null;
  hire_date?: string | null;
  employee_id?: string | null;
  avatar_color?: string;
  education_institution?: string | null;
  academic_degree?: string | null;
  field_of_study?: string | null;
  birth_date?: string | null;
  password?: string | null; // if provided, create with password instead of invite
  send_invite?: boolean; // default true if no password
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

    // Validate caller and check ADMIN role + school
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
      return new Response(JSON.stringify({ error: "Only school admins can invite teachers" }), {
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
      role: "TEACHER",
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

    // Ensure profile row has school_id and role and phone
    await admin.from("profiles").update({
      school_id: schoolId,
      role: "TEACHER",
      full_name: body.full_name,
      phone: body.phone ?? null,
    }).eq("id", userId);

    // Insert teacher record
    const { data: teacher, error: tErr } = await admin.from("teachers").insert({
      profile_id: userId,
      school_id: schoolId,
      subject_id: body.subject_id ?? null,
      hire_date: body.hire_date ?? null,
      employee_id: body.employee_id ?? null,
      avatar_color: body.avatar_color ?? "blue",
      education_institution: body.education_institution?.trim() || null,
      academic_degree: body.academic_degree?.trim() || null,
      field_of_study: body.field_of_study?.trim() || null,
      birth_date: body.birth_date?.trim() || null,
    }).select().single();

    if (tErr) throw tErr;

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

    return new Response(JSON.stringify({ teacher, user_id: userId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invite-teacher error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});