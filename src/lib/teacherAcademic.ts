export type AcademicDegreeValue = "twelfth_year" | "bachelors" | "masters" | "doctorate";

export const ACADEMIC_DEGREE_OPTIONS: { value: AcademicDegreeValue; label: string }[] = [
  { value: "twelfth_year", label: "12º ano" },
  { value: "bachelors", label: "Licenciatura" },
  { value: "masters", label: "Mestrado" },
  { value: "doctorate", label: "Doutoramento" },
];

export function academicDegreeLabel(value: string | null | undefined): string {
  if (!value || value.trim() === "") return "—";
  const hit = ACADEMIC_DEGREE_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? value;
}
