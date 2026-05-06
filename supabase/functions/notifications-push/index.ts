/**
 * Chamada típica: Supabase Database Webhook (INSERT em public.notifications → Edge Function).
 * Segredos: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY (REST API Key do painel OneSignal).
 * Opcional: NOTIFICATIONS_PUSH_WEBHOOK_SECRET — se definido, o webhook deve enviar o cabeçalho
 *   x-notification-push-secret com o mesmo valor (além ou em substituição da verificação por service role).
 * O External ID na app corresponde ao user id Supabase (recipient_id).
 * Respeita notification_preferences.channel = user_push (omitir push se disabled).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_PUSH_CHANNEL = "user_push";
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
  if (supabaseUrl && serviceRole) {
    const admin = createClient(supabaseUrl, serviceRole);
    const { data: pushPref, error: prefErr } = await admin
      .from("notification_preferences")
      .select("enabled")
      .eq("user_id", recipientId)
      .eq("channel", USER_PUSH_CHANNEL)
      .maybeSingle();

    if (!prefErr && pushPref?.enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: "push_disabled" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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

  const payload: Record<string, unknown> = {
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
    payload.url = link;
  }

  const osRes = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${restKey}`,
    },
    body: JSON.stringify(payload),
  });

  const osText = await osRes.text();
  console.log(`notifications-push: OneSignal response ${osRes.status} for recipient=${recipientId} → ${osText}`);

  if (!osRes.ok) {
    console.error("notifications-push: OneSignal recusou o envio", osRes.status, osText);
    return new Response(
      JSON.stringify({ error: "OneSignal recusou o envio", status: osRes.status, detail: osText }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, onesignal: JSON.parse(osText) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
