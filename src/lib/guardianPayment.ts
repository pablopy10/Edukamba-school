export type GuardianPaymentMode = "proof_attachment" | "in_person";

export function normalizeGuardianPaymentMode(v: unknown): GuardianPaymentMode {
  return v === "in_person" ? "in_person" : "proof_attachment";
}

export function encarregadosUsamAnexo(mode: GuardianPaymentMode | unknown): boolean {
  return normalizeGuardianPaymentMode(mode) === "proof_attachment";
}
