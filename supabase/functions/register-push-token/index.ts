/**
 * register-push-token — Regista um token APNs/FCM no OneSignal associado ao utilizador.
 * Chamado pela app nativa após obter o token de @capacitor/push-notifications.
 *
 * Auth: JWT de utilizador autenticado (não service_role).
 * Body: { token: string, platform: "ios" | "android" }
 * Segredos: ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
  const onesignalRestKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRole) {
    return new Response(JSON.stringify({ error: "Servidor mal configurado" }), { status: 500 });
  }
  if (!onesignalAppId || !onesignalRestKey) {
    console.warn("register-push-token: ONESIGNAL_APP_ID ou ONESIGNAL_REST_API_KEY não configurados");
    return new Response(JSON.stringify({ ok: true, skipped: "onesignal_not_configured" }), { status: 200 });
  }

  // Autenticar utilizador
  const authHeader = req.headers.get("authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });
  }

  let body: { token: string; platform: "ios" | "android" };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
  }

  const { token, platform } = body;
  if (!token || !platform) {
    return new Response(JSON.stringify({ error: "token e platform são obrigatórios" }), { status: 400 });
  }

  // Registar token no OneSignal via User Model API (v2)
  const subscriptionType = platform === "ios" ? "iOSPush" : "AndroidPush";

  const osPayload = {
    identity: { external_id: user.id },
    subscriptions: [
      {
        type: subscriptionType,
        token,
        enabled: true,
      },
    ],
  };

  const osRes = await fetch(`https://api.onesignal.com/apps/${onesignalAppId}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${onesignalRestKey}`,
    },
    body: JSON.stringify(osPayload),
  });

  if (!osRes.ok) {
    const osText = await osRes.text();
    console.error("register-push-token: OneSignal rejeitou", osRes.status, osText);
    return new Response(
      JSON.stringify({ ok: false, warning: "OneSignal recusou", status: osRes.status }),
      { status: 200 },
    );
  }

  console.log(`register-push-token: token ${platform} registado para user ${user.id}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
