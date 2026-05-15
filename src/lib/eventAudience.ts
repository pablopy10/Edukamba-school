const CLASSROOM_RE = /^classroom:([0-9a-fA-F\-]{36})$/i;
const STUDENTS_RE = /^students:([0-9a-fA-F\-,\s]+)$/i;
const EDUCATORS_RE = /^educators:([0-9a-fA-F\-,\s]+)$/i;

/** Valor guardado em `events.audience` (prefixos em maiúsculas na escrita). */
export type EventAudienceMode = "all" | "staff" | "students" | "educators" | "classroom_legacy";

export type ParsedEventAudience = {
  mode: EventAudienceMode;
  /** Turmas referenciadas (vazio para ALL/STAFF). */
  classroomIds: string[];
  /** Texto livre legado (tratado como ALL no envio de notificações). */
  legacyText: string | null;
};

function parseUuidCsvSegment(seg: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of seg.split(",")) {
    const id = part.trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function parseEventAudience(raw: string | null | undefined): ParsedEventAudience {
  const v = raw?.trim() ?? "";
  if (!v) return { mode: "all", classroomIds: [], legacyText: null };
  const u = v.toUpperCase();
  if (u === "ALL") return { mode: "all", classroomIds: [], legacyText: null };
  if (u === "STAFF") return { mode: "staff", classroomIds: [], legacyText: null };

  const sm = STUDENTS_RE.exec(v);
  if (sm) {
    const ids = parseUuidCsvSegment(sm[1] ?? "");
    return { mode: "students", classroomIds: ids, legacyText: null };
  }

  const em = EDUCATORS_RE.exec(v);
  if (em) {
    const ids = parseUuidCsvSegment(em[1] ?? "");
    return { mode: "educators", classroomIds: ids, legacyText: null };
  }

  const cm = CLASSROOM_RE.exec(v);
  if (cm) return { mode: "classroom_legacy", classroomIds: cm[1] ? [cm[1]] : [], legacyText: null };

  return { mode: "all", classroomIds: [], legacyText: v };
}

/** Codifica para coluna `events.audience`. */
export function stringifyEventAudience(p: Omit<ParsedEventAudience, "legacyText">): string {
  switch (p.mode) {
    case "staff":
      return "STAFF";
    case "students": {
      if (p.classroomIds.length === 0) return "ALL";
      return `STUDENTS:${[...new Set(p.classroomIds)].sort().join(",")}`;
    }
    case "educators": {
      if (p.classroomIds.length === 0) return "ALL";
      return `EDUCATORS:${[...new Set(p.classroomIds)].sort().join(",")}`;
    }
    case "classroom_legacy": {
      const id = p.classroomIds[0];
      if (!id) return "ALL";
      return `CLASSROOM:${id}`;
    }
    case "all":
    default:
      return "ALL";
  }
}

export function formatEventAudienceSummary(
  raw: string | null | undefined,
  classroomNames?: Record<string, string>,
): string {
  const p = parseEventAudience(raw);
  if (p.legacyText) return p.legacyText;
  if (p.mode === "staff") return "Funcionários";
  if (p.mode === "all") return "Todos";
  if (p.mode === "educators") {
    const names = p.classroomIds.map((id) => classroomNames?.[id] ?? "").filter(Boolean);
    if (names.length === 0) return "Educadores (encarregados)";
    return `Educadores — ${names.join(", ")}`;
  }
  if (p.mode === "students") {
    const names = p.classroomIds.map((id) => classroomNames?.[id] ?? "").filter(Boolean);
    if (names.length === 0) return "Alunos";
    return `Alunos — ${names.join(", ")}`;
  }
  const id = p.classroomIds[0];
  if (!id) return "Turma";
  const nm = classroomNames?.[id];
  return nm ? `Turma: ${nm}` : "Turma";
}

/** Lista de IDs de turmas para filtros na UI e presença de alunos. */
export function audienceClassroomFilterIds(p: ParsedEventAudience): string[] | null {
  if (p.mode === "classroom_legacy") return p.classroomIds.length ? [...p.classroomIds] : null;
  if (p.mode === "students") return p.classroomIds.length ? [...p.classroomIds] : null;
  if (p.mode === "educators") return p.classroomIds.length ? [...p.classroomIds] : null;
  if (p.mode === "all") return null; // todas as turmas / toda a escola
  return []; // staff — sem alunos
}

export function audienceUsesStudentRsvp(p: ParsedEventAudience): boolean {
  return p.mode === "students" || p.mode === "classroom_legacy";
}

export function audienceUsesProfileSelfRsvp(p: ParsedEventAudience): boolean {
  return p.mode === "all" || p.mode === "staff" || p.mode === "educators";
}

/** Funcionários (notify_event_school_staff): não PARENT nem STUDENT. */
export function roleIsSchoolStaffExcludedParentStudent(role: string | null | undefined): boolean {
  return !!role && role !== "PARENT" && role !== "STUDENT";
}

/** Encarregado abrangido por público Educadores nas turmas indicadas. */
export function guardianInEducatorsAudience(
  p: ParsedEventAudience,
  childClassroomIds: (string | null | undefined)[],
): boolean {
  if (p.mode !== "educators" || p.classroomIds.length === 0) return false;
  const set = new Set(p.classroomIds);
  return childClassroomIds.some((cid) => !!cid && set.has(cid));
}

export function profileMaySelfRespondToAudience(
  p: ParsedEventAudience,
  role: string | null | undefined,
  opts?: { guardianInEducatorsScope?: boolean },
): boolean {
  if (!role) return false;
  if (p.mode === "all") return true;
  if (p.mode === "staff") return roleIsSchoolStaffExcludedParentStudent(role);
  if (p.mode === "educators") return role === "PARENT" && (opts?.guardianInEducatorsScope ?? false);
  return false;
}

export function filterStudentsByAudience<T extends { id: string; classroom_id?: string | null }>(
  p: ParsedEventAudience,
  schoolStudents: T[],
): T[] {
  const rooms = audienceClassroomFilterIds(p);
  if (rooms === null) return schoolStudents.slice();
  if (rooms.length === 0) return [];
  const set = new Set(rooms);
  return schoolStudents.filter((s) => s.classroom_id && set.has(s.classroom_id));
}

/** Compatível com formulário antigo: valor do select + turmas opcionais. */
export type EventAudienceFormPreset = "all" | "staff" | "students" | "educators" | "classroom_legacy";

export function parsedAudienceToFormPreset(p: ParsedEventAudience): EventAudienceFormPreset {
  return p.mode;
}

export function formPresetToParsed(
  preset: EventAudienceFormPreset,
  classroomIds: string[],
  singleLegacyClassroomId?: string | null,
): Omit<ParsedEventAudience, "legacyText"> {
  if (preset === "classroom_legacy") {
    return { mode: "classroom_legacy", classroomIds: singleLegacyClassroomId ? [singleLegacyClassroomId] : [] };
  }
  if (preset === "students" || preset === "educators") {
    return { mode: preset, classroomIds };
  }
  if (preset === "staff") return { mode: "staff", classroomIds: [] };
  return { mode: "all", classroomIds: [] };
}
