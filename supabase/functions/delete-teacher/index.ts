import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(JSON.stringify({ error: "Only school admins can delete teachers" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { teacher_id } = await req.json();
    if (!teacher_id) {
      return new Response(JSON.stringify({ error: "teacher_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: teacher, error: tErr } = await admin
      .from("teachers")
      .select("id, profile_id, school_id")
      .eq("id", teacher_id)
      .maybeSingle();

    if (tErr || !teacher) {
      return new Response(JSON.stringify({ error: "Teacher not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (teacher.school_id !== callerProfile.school_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileId = teacher.profile_id;

    // Delete teacher row
    const { error: delTErr } = await admin.from("teachers").delete().eq("id", teacher_id);
    if (delTErr) throw delTErr;

    // Delete profile + auth user
    if (profileId) {
      await admin.from("profiles").delete().eq("id", profileId);
      const { error: authErr } = await admin.auth.admin.deleteUser(profileId);
      if (authErr) console.error("auth delete error", authErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delete-teacher error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});