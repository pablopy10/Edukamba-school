import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Grade levels eligible to have a platform login
const ELIGIBLE_GRADES = new Set([
  "Ensino Secundário",
  "Ensino Médio",
  "Ensino Técnico-Profissional",
]);

interface InvitePayload {
  student_id: string;
  email: string;
  password?: string | null; // if provided (>=6), create account immediately; else send invite
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
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, school_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!callerProfile?.school_id || callerProfile.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar credenciais de aluno" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: InvitePayload = await req.json();
    if (!body.student_id || !body.email) {
      return new Response(JSON.stringify({ error: "student_id e email são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: student, error: stErr } = await admin
      .from("students")
      .select("id, full_name, school_id, user_id, classroom_id, classrooms:classroom_id(grade_level)")
      .eq("id", body.student_id)
      .maybeSingle();
    if (stErr || !student) {
      return new Response(JSON.stringify({ error: "Aluno não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (student.school_id !== callerProfile.school_id) {
      return new Response(JSON.stringify({ error: "Aluno não pertence à sua escola" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (student.user_id) {
      return new Response(JSON.stringify({ error: "Este aluno já tem uma conta de acesso" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate grade eligibility (current classroom OR any active enrollment in eligible level)
    const grade = (student.classrooms as { grade_level: string | null } | null)?.grade_level ?? null;
    let eligible = grade !== null && ELIGIBLE_GRADES.has(grade);
    if (!eligible) {
      const { data: enrolls } = await admin
        .from("enrollments")
        .select("status, classrooms:classroom_id(grade_level)")
        .eq("student_id", student.id);
      eligible = (enrolls ?? []).some((e: any) =>
        e.status === "ACTIVE" && ELIGIBLE_GRADES.has(e.classrooms?.grade_level ?? "")
      );
    }
    if (!eligible) {
      return new Response(
        JSON.stringify({
          error: "Este aluno não é elegível para acesso à plataforma. Apenas alunos do Ensino Secundário, Médio ou Técnico-Profissional podem ter credenciais.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const meta = {
      full_name: student.full_name,
      role: "STUDENT",
      school_id: callerProfile.school_id,
    };
    const redirectTo = `${req.headers.get("origin") ?? ""}/auth`;

    let userId: string | null = null;
    if (body.password && body.password.length >= 6) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: meta,
      });
      if (createErr) throw createErr;
      userId = created.user?.id ?? null;
    } else {
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        body.email,
        { data: meta, redirectTo },
      );
      if (inviteErr) throw inviteErr;
      userId = invited.user?.id ?? null;
    }

    if (!userId) throw new Error("Falha ao criar utilizador");

    await admin.from("profiles").update({
      school_id: callerProfile.school_id,
      role: "STUDENT",
      full_name: student.full_name,
    }).eq("id", userId);

    await admin.from("students")
      .update({ user_id: userId, email: body.email })
      .eq("id", student.id);

    return new Response(JSON.stringify({ user_id: userId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invite-student error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});