export const GRADE_LEVELS = [
  "Creche",
  "Pré-escolar",
  "Ensino Primário",
  "1º Ciclo",
  "2º Ciclo",
  "3º Ciclo",
  "Ensino Secundário",
  "Ensino Médio",
  "Ensino Técnico-Profissional",
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];