import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function buildCredentialsHtml(opts: { recipientName: string; email: string; password: string; loginUrl: string; schoolName: string }): string {
  const { recipientName, email, password, loginUrl, schoolName } = opts;
  const firstName = recipientName.split(" ")[0] || recipientName;
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
<tr><td style="background:#3b82f6;padding:28px 32px;text-align:center;"><div style="font-size:40px;">🔑</div>
<p style="margin:8px 0 0;color:#fff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Credenciais de Acesso</p></td></tr>
<tr><td style="padding:20px 32px 0;text-align:center;border-bottom:1px solid #e5e7eb;">
<span style="font-size:22px;font-weight:800;color:#1e293b;">Edu<span style="color:#93c5fd;">kamba</span></span>
<p style="margin:4px 0 16px;font-size:12px;color:#94a3b8;">${schoolName}</p></td></tr>
<tr><td style="padding:28px 32px;">
<p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">Olá, <strong style="color:#1e293b;">${firstName}</strong></p>
<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;">A sua conta foi criada na plataforma Edukamba</h1>
<p style="margin:0 0 20px;font-size:14px;color:#374151;">Utilize as seguintes credenciais para aceder à plataforma:</p>
<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px;">
<p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;">Email</p>
<p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1e293b;">${email}</p>
<p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;border-top:1px solid #e5e7eb;padding-top:16px;">Password</p>
<p style="margin:0;font-size:20px;font-weight:700;color:#1e293b;letter-spacing:3px;font-family:monospace;">${password}</p></div>
<div style="text-align:center;"><a href="${loginUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:24px;">🔐 Entrar na plataforma</a></div>
<p style="margin:20px 0 0;font-size:13px;color:#94a3b8;text-align:center;">Por segurança, recomendamos que altere a sua password após o primeiro acesso.</p>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0;font-size:12px;color:#94a3b8;">Este email foi enviado automaticamente pelo sistema Edukamba.<br/>Por favor não responda diretamente a esta mensagem.</p>
</td></tr></table></td></tr></table></body></html>`;
}

async function sendCredentialsEmail(opts: { recipientName: string; recipientEmail: string; password: string; loginUrl: string; schoolName: string; brevoKey: string; senderEmail: string; senderName: string }): Promise<void> {
  const { recipientName, recipientEmail, password, loginUrl, schoolName, brevoKey, senderEmail, senderName } = opts;
  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoKey },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipientName }],
        subject: `${schoolName} — As suas credenciais de acesso à plataforma`,
        htmlContent: buildCredentialsHtml({ recipientName, email: recipientEmail, password, loginUrl, schoolName }),
      }),
    });
    if (!res.ok) console.error(`credentials-email: Brevo [${res.status}] to=${recipientEmail} — ${await res.text()}`);
    else console.log(`credentials-email: enviado para ${recipientEmail}`);
  } catch (e) { console.error("credentials-email: falha ao enviar", e); }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return corsJson({ error: "Missing authorization" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return corsJson({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerProfile, error: profErr } = await admin
      .from("profiles")
      .select("role, school_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profErr || !callerProfile?.school_id) {
      return corsJson({ error: "Perfil inválido" }, 403);
    }

    const callerRole = callerProfile.role as string;
    if (callerRole !== "ADMIN" && callerRole !== "SUPER_ADMIN" && callerRole !== "DIRECTOR") {
      return corsJson({ error: "Apenas administradores ou director podem criar utilizadores" }, 403);
    }

    const body: InvitePayload = await req.json();
    const email = body.email?.trim();
    const fullName = body.full_name?.trim();
    const role = body.role?.trim();

    if (callerRole === "DIRECTOR" && role === "ADMIN") {
      return corsJson({ error: "Apenas o administrador da escola pode criar outro administrador" }, 403);
    }

    if (!email || !fullName || !role) {
      return corsJson({ error: "email, full_name e role são obrigatórios" }, 400);
    }

    if (!INVITABLE_ROLES.has(role)) {
      return corsJson({ error: "Função não permitida para convite" }, 400);
    }

    if (body.password != null && body.password !== "" && (body.password as string).length < 6) {
      return corsJson({ error: "Password deve ter pelo menos 6 caracteres" }, 400);
    }

    const schoolId = callerProfile.school_id;
    const meta = {
      full_name: fullName,
      role,
      school_id: schoolId,
    };

    if (!body.password || (body.password as string).length < 6) {
      return corsJson({ error: "password obrigatória (mín. 6 caracteres)" }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: body.password as string,
      email_confirm: true,
      user_metadata: meta,
    });
    if (createErr) throw createErr;
    const userId = created.user?.id ?? null;

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

    // Send credentials email (fire-and-forget)
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (brevoKey) {
      const { data: school } = await admin.from("schools").select("name").eq("id", schoolId).maybeSingle();
      const origin = req.headers.get("origin") ?? "https://app.edukamba.com";
      void sendCredentialsEmail({
        recipientName: fullName,
        recipientEmail: email,
        password: body.password as string,
        loginUrl: `${origin}/auth`,
        schoolName: school?.name ?? "Edukamba",
        brevoKey,
        senderEmail: Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com",
        senderName: Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba",
      });
    }

    return corsJson({ user_id: userId }, 200);
  } catch (e) {
    console.error("invite-school-user error", e);
    return corsJson({ error: (e as Error).message }, 500);
  }
});
