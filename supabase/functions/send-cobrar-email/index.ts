import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface Payload {
  student_id: string;
  title: string;
  description: string;
  link?: string;
}

function buildPaymentHtml(opts: {
  recipientName: string;
  studentName: string;
  title: string;
  description: string;
  loginUrl: string;
  appUrl: string;
  schoolName: string;
}): string {
  const { recipientName, studentName, title, description, loginUrl, appUrl, schoolName } = opts;
  const firstName = recipientName.split(" ")[0] || recipientName;

  return `<!DOCTYPE html><html lang="pt">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

  <!-- Header -->
  <tr><td style="background:#f59e0b;padding:28px 32px;text-align:center;">
    <div style="font-size:40px;">💳</div>
    <p style="margin:8px 0 0;color:#fff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Lembrete de Pagamento</p>
  </td></tr>

  <!-- Branding -->
  <tr><td style="padding:20px 32px 0;text-align:center;border-bottom:1px solid #e5e7eb;">
    <span style="font-size:22px;font-weight:800;color:#1e293b;">Edu<span style="color:#fcd34d;">kamba</span></span>
    <p style="margin:4px 0 16px;font-size:12px;color:#94a3b8;">${schoolName}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">Olá, <strong style="color:#1e293b;">${firstName}</strong></p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;">${title}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">${description}</p>

    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#92400e;">
        ⚠️ Por favor regularize o pagamento o mais brevemente possível para evitar situações de incumprimento.
      </p>
    </div>

    <div style="text-align:center;">
      <a href="${loginUrl}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:24px;">
        💳 Ver pagamento
      </a>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      Tem a app Edukamba instalada?
      <a href="${appUrl}" style="color:#f59e0b;font-weight:600;text-decoration:none;">Abrir na app</a>
    </p>
    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
      Se já efectuou o pagamento, por favor anexe o comprovativo na plataforma.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      Este email foi enviado automaticamente pelo sistema Edukamba.<br/>
      Por favor não responda diretamente a esta mensagem.
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

async function sendEmail(opts: {
  recipientName: string;
  recipientEmail: string;
  studentName: string;
  title: string;
  description: string;
  loginUrl: string;
  appUrl: string;
  schoolName: string;
  brevoKey: string;
  senderEmail: string;
  senderName: string;
}): Promise<void> {
  const html = buildPaymentHtml(opts);
  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": opts.brevoKey },
      body: JSON.stringify({
        sender: { name: opts.senderName, email: opts.senderEmail },
        to: [{ email: opts.recipientEmail, name: opts.recipientName }],
        subject: `${opts.schoolName} — ${opts.title}`,
        htmlContent: html,
      }),
    });
    if (!res.ok) console.error(`cobrar-email: Brevo [${res.status}] to=${opts.recipientEmail} — ${await res.text()}`);
    else console.log(`cobrar-email: enviado para ${opts.recipientEmail}`);
  } catch (e) {
    console.error("cobrar-email: falha ao enviar", e);
  }
}

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, school_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!callerProfile?.school_id) return corsJson({ error: "Perfil não encontrado" }, 403);

    const body: Payload = await req.json();
    if (!body.student_id) return corsJson({ error: "student_id obrigatório" }, 400);

    const { data: student } = await admin
      .from("students")
      .select("id, full_name, email, parent_id, school_id")
      .eq("id", body.student_id)
      .maybeSingle();

    if (!student) return corsJson({ ok: true, skipped: "student not found" });
    if (student.school_id !== callerProfile.school_id) return corsJson({ error: "Forbidden" }, 403);

    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey) return corsJson({ ok: true, skipped: "no brevo key" });

    const { data: school } = await admin.from("schools").select("name").eq("id", callerProfile.school_id).maybeSingle();
    const schoolName = school?.name ?? "Edukamba";
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba";

    // body.link is always a full URL sent from the frontend (window.location.origin + path)
    const rawLink = body.link ?? "";
    const loginUrl = rawLink.startsWith("http") ? rawLink : `https://www.edukamba.com/pagamentos`;
    // App deep link: usa custom URL scheme para abrir a app mobile diretamente
    const appUrl = "edukamba://pagamentos";

    // Enviar apenas 1 email: ao encarregado se existir, caso contrário ao aluno.
    let recipientEmail: string | null = null;
    let recipientName = "Encarregado";

    if (student.parent_id) {
      const { data: parentAuth } = await admin.auth.admin.getUserById(student.parent_id);
      const parentEmailRaw = parentAuth?.user?.email;
      if (parentEmailRaw) {
        const { data: parentProfile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", student.parent_id)
          .maybeSingle();
        recipientEmail = parentEmailRaw;
        recipientName = parentProfile?.full_name ?? "Encarregado";
      }
    }

    // Fallback para o aluno se não houver encarregado com email
    if (!recipientEmail && student.email) {
      recipientEmail = student.email;
      recipientName = student.full_name;
    }

    if (recipientEmail) {
      await sendEmail({
        recipientName,
        recipientEmail,
        studentName: student.full_name,
        title: body.title,
        description: body.description,
        loginUrl,
        appUrl,
        schoolName,
        brevoKey,
        senderEmail,
        senderName,
      });
    }

    const sent = recipientEmail ? 1 : 0;

    return corsJson({ ok: true, sent });
  } catch (e) {
    console.error("send-cobrar-email error", e);
    return corsJson({ error: (e as Error).message }, 500);
  }
});
