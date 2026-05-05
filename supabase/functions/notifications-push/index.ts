/**
 * Chamada típica: Supabase Database Webhook (INSERT em public.notifications → Edge Function).
 * Segredos: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY (REST API Key do painel OneSignal).
 * Opcional: NOTIFICATIONS_PUSH_WEBHOOK_SECRET — se definido, o webhook deve enviar o cabeçalho
 *   x-notification-push-secret com o mesmo valor (além ou em substituição da verificação por service role).
 * O External ID na app corresponde ao user id Supabase (recipient_id).
 * Respeita notification_preferences.channel = user_push (omitir push se disabled).
 * Respeita notification_preferences.channel = user_email (enviar email via OneSignal se enabled).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_PUSH_CHANNEL = "user_push";
const USER_EMAIL_CHANNEL = "user_email";
function authorizeNotificationsPush(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const shared = Deno.env.get("NOTIFICATIONS_PUSH_WEBHOOK_SECRET");

  if (shared) {
    const h = req.headers.get("x-notification-push-secret")?.trim();
    if (h === shared) return true;
  }

  if (serviceRole) {
    const apikey = req.headers.get("apikey")?.trim();
    const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (apikey === serviceRole || auth === serviceRole) return true;
  }

  return false;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: NotificationRow;
  old_record?: unknown;
}

interface NotificationRow {
  id?: string;
  recipient_id?: string;
  title?: string;
  description?: string | null;
  link?: string | null;
  category?: string | null;
}

function buildEmailBody(title: string, description: string, link: string | null): string {
  const linkBtn = link
    ? `<tr><td style="padding:24px 40px 0"><a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px">Ver detalhes</a></td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:560px;width:100%">
        <tr><td style="background:#4f46e5;padding:28px 40px">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.3px">${title}</p>
        </td></tr>
        ${description ? `<tr><td style="padding:28px 40px 0"><p style="margin:0;color:#374151;font-size:15px;line-height:1.6">${description}</p></td></tr>` : ""}
        ${linkBtn}
        <tr><td style="padding:32px 40px">
          <p style="margin:0;color:#9ca3af;font-size:12px">Esta mensagem foi enviada automaticamente pela plataforma Edukamba. Por favor não responda a este email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function extractRecord(body: unknown): NotificationRow | null {
  if (!body || typeof body !== "object") return null;
  const o = body as WebhookPayload & NotificationRow;

  if (o.table != null && o.table !== "notifications") return null;
  if (o.type != null && String(o.type).toUpperCase() !== "INSERT") return null;

  const fromWebhook = o.record;
  if (fromWebhook && typeof fromWebhook === "object") return fromWebhook as NotificationRow;

  if (typeof o.recipient_id === "string" && typeof o.title === "string") {
    return {
      id: o.id,
      recipient_id: o.recipient_id,
      title: o.title,
      description: o.description ?? null,
      link: o.link ?? null,
      category: o.category ?? null,
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!authorizeNotificationsPush(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const record = extractRecord(body);
  if (!record) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recipientId = record.recipient_id?.trim();
  const title = record.title?.trim();
  const id = record.id;
  if (!recipientId || !title) {
    return new Response(JSON.stringify({ error: "recipient_id e title são obrigatórios" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let emailEnabled = true;
  let admin: ReturnType<typeof createClient> | null = null;

  if (supabaseUrl && serviceRole) {
    admin = createClient(supabaseUrl, serviceRole);

    const { data: prefs, error: prefErr } = await admin
      .from("notification_preferences")
      .select("channel, enabled")
      .eq("user_id", recipientId)
      .in("channel", [USER_PUSH_CHANNEL, USER_EMAIL_CHANNEL]);

    if (!prefErr && prefs) {
      const byChannel = Object.fromEntries(prefs.map((r: { channel: string; enabled: boolean }) => [r.channel, r.enabled]));
      if (byChannel[USER_PUSH_CHANNEL] === false) {
        return new Response(JSON.stringify({ ok: true, skipped: "push_disabled" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (byChannel[USER_EMAIL_CHANNEL] === false) {
        emailEnabled = false;
      }
    }
  }

  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!appId || !restKey) {
    console.error("notifications-push: em falta ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY");
    return new Response(JSON.stringify({ error: "Servidor mal configurado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const description = (record.description ?? "").trim();
  const bodyText = description.length > 0 ? description : title;
  const link = record.link?.trim() || null;

  const osHeaders = {
    "Content-Type": "application/json",
    Authorization: `Key ${restKey}`,
  };

  // --- Push notification ---
  const pushPayload: Record<string, unknown> = {
    app_id: appId,
    include_aliases: { external_id: [recipientId] },
    target_channel: "push",
    headings: { en: title, pt: title },
    contents: { en: bodyText, pt: bodyText },
    data: {
      ...(id ? { notification_id: id } : {}),
      ...(record.category ? { category: record.category } : {}),
      ...(link ? { link } : {}),
    },
  };

  if (link && /^https?:\/\//i.test(link)) {
    pushPayload.url = link;
  }

  console.log("notifications-push: sending push to", recipientId, "title:", title);

  const osRes = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: osHeaders,
    body: JSON.stringify(pushPayload),
  });

  const osText = await osRes.text();
  if (!osRes.ok) {
    console.error("notifications-push: OneSignal push FAILED", osRes.status, osText);
    return new Response(
      JSON.stringify({ error: "OneSignal recusou o envio push", status: osRes.status, detail: osText }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
  console.log("notifications-push: OneSignal push OK", osRes.status, osText);

  // --- Email notification ---
  let emailResult: { status: number; body: string } | null = null;
  if (emailEnabled) {
    const emailPayload: Record<string, unknown> = {
      app_id: appId,
      include_aliases: { external_id: [recipientId] },
      target_channel: "email",
      email_subject: title,
      email_body: buildEmailBody(title, description, link),
    };

    console.log("notifications-push: email payload", JSON.stringify({ ...emailPayload, email_body: "[omitted]" }));

    const emailRes = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: osHeaders,
      body: JSON.stringify(emailPayload),
    });

    const emailText = await emailRes.text();
    emailResult = { status: emailRes.status, body: emailText };

    if (!emailRes.ok) {
      console.warn("notifications-push: OneSignal email FAILED", emailRes.status, emailText);
    } else {
      console.log("notifications-push: OneSignal email OK", emailRes.status, emailText);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, email_sent: emailEnabled, email_result: emailResult }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
