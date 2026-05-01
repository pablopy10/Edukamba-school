export const qk = {
  perfilProfile: (userId: string | undefined) => ["profiles", userId ?? "anon"] as const,
  horariosDataset: (
    scope: readonly string[],
    schoolId: string | null,
    academicYearId: string | null,
  ) => ["horarios", "dataset", schoolId ?? "", academicYearId ?? "", ...scope] as const,
  pagamentosBootstrap: (scope: readonly string[]) => ["pagamentos", "bootstrap", ...scope] as const,
};
