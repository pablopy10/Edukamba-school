import { supabase } from "@/integrations/supabase/client";
import { moduleMeta, type ModuleKey } from "@/context/ModulesContext";

export type AuthorizationNotifyModule = "extracurricular" | "transport" | "meal";

const MODULE_ROUTE_KEY: Record<AuthorizationNotifyModule, ModuleKey> = {
  extracurricular: "extracurriculares",
  transport: "transportes",
  meal: "refeicoes",
};

const MODULE_LABEL_PT: Record<AuthorizationNotifyModule, string> = {
  extracurricular: "Extracurriculares",
  transport: "Transporte escolar",
  meal: "Refeições",
};

function normalizeClassIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

async function resolveRecipientIds(args: {
  templateId: string;
  schoolId: string;
  recipientMode: string;
  recipientClassroomIds: string[];
}): Promise<string[]> {
  const { templateId, schoolId, recipientMode, recipientClassroomIds } = args;
  let ids: string[] = [];

  if (recipientMode === "named_student_assignee") {
    const { data, error } = await supabase
      .from("module_authorization_named_recipients")
      .select("assignee_profile_id")
      .eq("template_id", templateId);
    if (error?.message?.includes("does not exist")) return [];
    if (error) throw error;
    ids = [...new Set((data ?? []).map((r: { assignee_profile_id?: string }) => r.assignee_profile_id).filter(Boolean))];
  } else if (recipientMode === "classroom_homeroom_teachers") {
    if (recipientClassroomIds.length === 0) return [];
    const [classroomsRes, schedulesRes] = await Promise.all([
      supabase
        .from("classrooms")
        .select("homeroom_teacher_id")
        .eq("school_id", schoolId)
        .in("id", recipientClassroomIds),
      supabase
        .from("schedules")
        .select("teacher_id")
        .eq("school_id", schoolId)
        .in("classroom_id", recipientClassroomIds)
        .not("teacher_id", "is", null),
    ]);
    if (classroomsRes.error) throw classroomsRes.error;
    if (schedulesRes.error) throw schedulesRes.error;
    const merged = [
      ...(classroomsRes.data ?? []).map((r: { homeroom_teacher_id?: string | null }) => r.homeroom_teacher_id),
      ...(schedulesRes.data ?? []).map((r: { teacher_id?: string | null }) => r.teacher_id),
    ];
    ids = [...new Set(merged.filter((x): x is string => typeof x === "string" && x.trim() !== ""))];
  }

  const selfFiltered = [...new Set(ids.flatMap((u) => (u.trim() ? [u.trim()] : [])))];
  return selfFiltered;
}

const INSERT_CHUNK = 45;

/** Inserts one `notifications` row per assignee → webhooks notifications-email / notifications-push. */
export async function notifyModuleAuthorizationAssignees(args: {
  schoolId: string;
  actorId: string;
  module: AuthorizationNotifyModule;
  template: {
    id: string;
    title: string;
    is_active: boolean;
    recipient_mode?: string | null;
    recipient_classroom_ids?: unknown;
  };
}): Promise<{ sent: number; error?: string }> {
  const { schoolId, actorId, module, template } = args;
  if (!template.is_active || !schoolId.trim() || !actorId.trim()) {
    return { sent: 0 };
  }

  const rawMode =
    typeof template.recipient_mode === "string" && template.recipient_mode.trim()
      ? template.recipient_mode.trim()
      : "";
  const recipientMode =
    rawMode === "named_student_assignee" ? "named_student_assignee" : "classroom_homeroom_teachers";

  let recipientIds: string[] = [];
  try {
    recipientIds = await resolveRecipientIds({
      templateId: template.id,
      schoolId,
      recipientMode,
      recipientClassroomIds: normalizeClassIds(template.recipient_classroom_ids),
    });
  } catch (e) {
    return { sent: 0, error: e instanceof Error ? e.message : String(e) };
  }

  if (recipientIds.length === 0) {
    return { sent: 0 };
  }

  const { data: actor } = await supabase.from("profiles").select("full_name").eq("id", actorId).maybeSingle();
  const actorName = typeof actor?.full_name === "string" ? actor.full_name.trim() || null : null;

  const path = `${moduleMeta[MODULE_ROUTE_KEY[module]].path}?tab=autorizacoes`;
  const area = MODULE_LABEL_PT[module];

  const title = `Nova autorização: ${template.title.trim()}`;
  const description = [
    `A escola publicou o formulário «${template.title.trim()}» (${area}).`,
    "",
    `Abra a área Autorizações neste módulo para avaliar e submeter.`,
  ].join("\n");

  const rows = recipientIds.map((recipient_id) => ({
    school_id: schoolId,
    recipient_id,
    actor_id: actorId,
    actor_name: actorName,
    category: "MODULE_AUTHORIZATION",
    title,
    description,
    link: path,
    status: "unread" as const,
  }));

  let sent = 0;
  try {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const slice = rows.slice(i, i + INSERT_CHUNK);
      const { error } = await supabase.from("notifications").insert(slice as never[]);
      if (error) {
        return { sent, error: error.message };
      }
      sent += slice.length;
    }
  } catch (e) {
    return {
      sent,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  return { sent };
}
