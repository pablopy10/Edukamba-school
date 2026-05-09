/**
 * notify-attendance — Envia email + push ao educador quando o professor regista
 * uma falta (ABSENT), atraso (LATE) ou ocorrência disciplinar (DISCIPLINARY).
 *
 * Auth: JWT de utilizador autenticado (professor/admin da escola).
 * Body: { student_id: string, status: "ABSENT"|"LATE"|"DISCIPLINARY", date: string }
 *
 * Segredos: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME,
 *           ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const STATUS_PT: Record<string, string> = {
  ABSENT: "Falta",
  LATE: "Atraso",
  DISCIPLINARY: "Ocorrência Disciplinar",
};

const STATUS_EMOJI: Record<string, string> = {
  ABSENT: "🚨",
  LATE: "⏰",
  DISCIPLINARY: "⚠️",
};

const STATUS_COLOR: Record<string, string> = {
  ABSENT: "#ef4444",
  LATE: "#f59e0b",
  DISCIPLINARY: "#8b5cf6",
};

function buildEmailHtml(opts: {
  recipientName: string;
  studentName: string;
  statusPt: string;
  statusEmoji: string;
  statusColor: string;
  dateStr: string;
  classroomName: string;
  schoolName: string;
  link: string;
}): string {
  const { recipientName, studentName, statusPt, statusEmoji, statusColor, dateStr, classroomName, schoolName, link } = opts;
  const firstName = recipientName.split(" ")[0] || recipientName;

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${statusEmoji} Registo de Presença</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:${statusColor};padding:32px 32px 24px;text-align:center;">
          <p style="margin:0;font-size:36px;">${statusEmoji}</p>
          <h1 style="margin:12px 0 0;color:#ffffff;font-size:20px;font-weight:700;">Registo de Presença</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${schoolName}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;">Olá, <strong>${firstName}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
            A presença do(a) seu(sua) educando(a) <strong>${studentName}</strong>
            foi registada com o seguinte estado:
          </p>
          <!-- Status Card -->
          <div style="background:#f8fafc;border-left:4px solid ${statusColor};border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">Estado</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:${statusColor};">${statusEmoji} ${statusPt}</p>
          </div>
          <!-- Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#64748b;font-weight:600;width:40%;">Aluno(a)</td>
              <td style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#1e293b;font-weight:500;">${studentName}</td>
            </tr>
            <tr><td colspan="2" style="height:4px;"></td></tr>
            <tr>
              <td style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#64748b;font-weight:600;">Turma</td>
              <td style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#1e293b;font-weight:500;">${classroomName}</td>
            </tr>
            <tr><td colspan="2" style="height:4px;"></td></tr>
            <tr>
              <td style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#64748b;font-weight:600;">Data</td>
              <td style="padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#1e293b;font-weight:500;">${dateStr}</td>
            </tr>
          </table>
          <!-- CTA -->
          <div style="text-align:center;margin-top:28px;">
            <a href="${link}" style="display:inline-block;background:${statusColor};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:14px 32px;border-radius:24px;letter-spacing:0.3px;">
              Ver na aplicação →
            </a>
          </div>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
            Pode gerir as notificações nas preferências da aplicação Edukamba.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">© 2026 Edukamba · Gestão Escolar</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const brevoSender = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com";
  const brevoSenderName = Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba";
  const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
  const onesignalRestKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRole) {
    return new Response(JSON.stringify({ error: "Servidor mal configurado" }), { status: 500 });
  }

  // Autenticar utilizador (professor/admin)
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });
  }

  let body: { student_id: string; status: string; date: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
  }

  const { student_id, status, date } = body;
  if (!student_id || !status || !date) {
    return new Response(
      JSON.stringify({ error: "student_id, status e date são obrigatórios" }),
      { status: 400 },
    );
  }

  const validStatuses = ["ABSENT", "LATE", "DISCIPLINARY"];
  if (!validStatuses.includes(status)) {
    return new Response(JSON.stringify({ ok: true, skipped: "status_nao_notificavel" }), { status: 200 });
  }

  const admin = createClient(supabaseUrl, serviceRole);

  // Buscar dados do aluno (nome, parent_id, classroom)
  const { data: student, error: sErr } = await admin
    .from("students")
    .select("full_name, parent_id, classroom_id, school_id")
    .eq("id", student_id)
    .maybeSingle();

  if (sErr || !student) {
    console.error("notify-attendance: aluno não encontrado", sErr);
    return new Response(JSON.stringify({ ok: true, skipped: "aluno_nao_encontrado" }), { status: 200 });
  }

  if (!student.parent_id) {
    return new Response(JSON.stringify({ ok: true, skipped: "sem_educador" }), { status: 200 });
  }

  // Buscar email e nome do educador
  const { data: parentProfile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", student.parent_id)
    .maybeSingle();

  const { data: parentAuth } = await admin.auth.admin.getUserById(student.parent_id);
  const parentEmail = parentProfile?.email ?? parentAuth?.user?.email;

  if (!parentEmail) {
    console.warn("notify-attendance: educador sem email", student.parent_id);
    return new Response(JSON.stringify({ ok: true, skipped: "sem_email_educador" }), { status: 200 });
  }

  // Buscar nome da turma
  const { data: classroom } = await admin
    .from("classrooms")
    .select("name")
    .eq("id", student.classroom_id)
    .maybeSingle();

  // Buscar nome da escola
  const { data: school } = await admin
    .from("schools")
    .select("name")
    .eq("id", student.school_id)
    .maybeSingle();

  const statusPt = STATUS_PT[status] ?? status;
  const statusEmoji = STATUS_EMOJI[status] ?? "📋";
  const statusColor = STATUS_COLOR[status] ?? "#3b82f6";
  const studentName = student.full_name ?? "Aluno(a)";
  const recipientName = parentProfile?.full_name ?? "Educador(a)";
  const classroomName = classroom?.name ?? "—";
  const schoolName = school?.name ?? "Edukamba";

  const dateObj = new Date(date + "T12:00:00Z");
  const dateStr = dateObj.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

  const notifTitle = `${statusEmoji} Registo de Presença — ${statusPt}`;
  const notifDescription = `A presença de ${studentName} (${classroomName}) no dia ${dateStr} foi registada como: ${statusPt}.`;
  const link = "https://www.edukamba.com/app-open?path=%2Fpresencas";
  const appLink = link; // /app-open já trata o redirect para a app ou web

  const results: Record<string, unknown> = {};

  // ── Email via Brevo ─────────────────────────────────────────────────────────
  if (brevoKey) {
    try {
      const htmlContent = buildEmailHtml({
        recipientName,
        studentName,
        statusPt,
        statusEmoji,
        statusColor,
        dateStr,
        classroomName,
        schoolName,
        link,
      });

      const brevoRes = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoKey,
        },
        body: JSON.stringify({
          sender: { name: brevoSenderName, email: brevoSender },
          to: [{ email: parentEmail, name: recipientName }],
          subject: `${statusEmoji} Registo de Presença — ${studentName}`,
          htmlContent,
        }),
      });

      if (!brevoRes.ok) {
        const t = await brevoRes.text();
        console.error("notify-attendance: Brevo erro", brevoRes.status, t);
        results.email = { ok: false, status: brevoRes.status };
      } else {
        results.email = { ok: true };
      }
    } catch (e) {
      console.error("notify-attendance: email exception", e);
      results.email = { ok: false, error: String(e) };
    }
  } else {
    results.email = { skipped: "brevo_nao_configurado" };
  }

  // ── Push via OneSignal ──────────────────────────────────────────────────────
  if (onesignalAppId && onesignalRestKey) {
    try {
      const osPayload = {
        app_id: onesignalAppId,
        include_aliases: { external_id: [student.parent_id] },
        target_channel: "push",
        headings: { en: notifTitle, pt: notifTitle },
        contents: { en: notifDescription, pt: notifDescription },
        data: { category: "ATTENDANCE", link },
        url: link,
      };

      const osRes = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${onesignalRestKey}`,
        },
        body: JSON.stringify(osPayload),
      });

      if (!osRes.ok) {
        const t = await osRes.text();
        console.error("notify-attendance: OneSignal erro", osRes.status, t);
        results.push = { ok: false, status: osRes.status };
      } else {
        results.push = { ok: true };
      }
    } catch (e) {
      console.error("notify-attendance: push exception", e);
      results.push = { ok: false, error: String(e) };
    }
  } else {
    results.push = { skipped: "onesignal_nao_configurado" };
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
