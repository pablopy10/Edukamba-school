import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  requested_plan: "Essencial" | "Pro" | "Enterprise";
  message?: string;
}

const TARGET_EMAIL = "geral@edukamba.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticated client (verifies JWT and yields user)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userRes.user;

    const body = (await req.json()) as Body;
    if (!body.requested_plan || !["Essencial", "Pro", "Enterprise"].includes(body.requested_plan)) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve profile + school
    const { data: profile } = await admin
      .from("profiles")
      .select("school_id, full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.school_id || profile.role !== "ADMIN") {
      return new Response(JSON.stringify({ error: "Only school admins can request plan changes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: school } = await admin
      .from("schools")
      .select("name, nif, subscription_status, trial_ends_at")
      .eq("id", profile.school_id)
      .maybeSingle();

    const { data: sub } = await admin
      .from("saas_subscriptions")
      .select("plan_type, billing_cycle")
      .eq("school_id", profile.school_id)
      .maybeSingle();

    const currentPlan = sub?.plan_type ?? "Enterprise";

    // Insert request log (using authenticated client so RLS applies)
    const { error: insertErr } = await userClient.from("plan_change_requests").insert({
      school_id: profile.school_id,
      requested_by: user.id,
      current_plan: currentPlan,
      requested_plan: body.requested_plan,
      message: body.message ?? null,
    });
    if (insertErr) {
      console.error("Failed to insert plan request:", insertErr);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to send email via Resend (optional; succeeds even if not configured)
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    if (RESEND_API_KEY) {
      try {
        const subject = `Pedido de plano ${body.requested_plan} — ${school?.name ?? "Escola"}`;
        const html = `
          <h2>Pedido de ativação/alteração de plano</h2>
          <p><strong>Escola:</strong> ${school?.name ?? "—"}</p>
          <p><strong>NIF:</strong> ${school?.nif ?? "—"}</p>
          <p><strong>Estado da subscrição:</strong> ${school?.subscription_status ?? "—"}</p>
          <p><strong>Plano atual:</strong> ${currentPlan}</p>
          <p><strong>Plano pretendido:</strong> ${body.requested_plan}</p>
          <p><strong>Solicitado por:</strong> ${profile.full_name ?? "—"} (${user.email ?? "sem email"})</p>
          ${body.message ? `<p><strong>Mensagem:</strong><br/>${body.message.replace(/\n/g, "<br/>")}</p>` : ""}
          <hr/>
          <p>Edukamba — gestão de planos</p>
        `;

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Edukamba <onboarding@resend.dev>",
            to: [TARGET_EMAIL],
            reply_to: user.email ?? undefined,
            subject,
            html,
          }),
        });
        emailSent = r.ok;
        if (!r.ok) console.error("Resend error:", await r.text());
      } catch (e) {
        console.error("Resend exception:", e);
      }
    } else {
      console.log("RESEND_API_KEY not configured — skipping email. Request stored in DB.");
    }

    return new Response(JSON.stringify({ success: true, email_sent: emailSent }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("request-plan-change error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});