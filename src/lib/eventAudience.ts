const CLASSROOM_RE = /^CLASSROOM:([0-9a-fA-F\-]{36})$/;

export type EventAudiencePreset = "all" | "staff" | "classroom";

export function encodeEventAudience(preset: EventAudiencePreset, classroomId?: string | null): string {
  switch (preset) {
    case "staff":
      return "STAFF";
    case "classroom": {
      if (!classroomId) return "ALL";
      return `CLASSROOM:${classroomId}`;
    }
    case "all":
    default:
      return "ALL";
  }
}

export function decodeEventAudience(raw: string | null | undefined): {
  preset: EventAudiencePreset;
  classroomId: string | null;
  /** Original free-text value when preset is inferred as ALL for legacy rows. */
  legacyText: string | null;
} {
  const v = raw?.trim() ?? "";
  if (!v) return { preset: "all", classroomId: null, legacyText: null };
  const u = v.toUpperCase();
  if (u === "ALL") return { preset: "all", classroomId: null, legacyText: null };
  if (u === "STAFF") return { preset: "staff", classroomId: null, legacyText: null };
  const m = CLASSROOM_RE.exec(v);
  if (m) return { preset: "classroom", classroomId: m[1], legacyText: null };
  return { preset: "all", classroomId: null, legacyText: v };
}

export function formatEventAudienceSummary(
  raw: string | null | undefined,
  classroomNames?: Record<string, string>,
): string {
  const d = decodeEventAudience(raw);
  if (d.preset === "staff") return "Funcionários";
  if (d.preset === "classroom") {
    if (!d.classroomId) return "Turma";
    const nm = classroomNames?.[d.classroomId];
    return nm ? `Turma: ${nm}` : "Turma";
  }
  if (d.legacyText) return d.legacyText;
  return "Todos";
}
