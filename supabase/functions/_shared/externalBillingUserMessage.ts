/** Remove referências ao fornecedor interno de faturação externa nas mensagens visíveis ao utilizador. */
export function externalBillingUserMessage(raw: string): string {
  return raw
    .replace(/^Vendus:\s*/gi, "")
    .replace(/\bVendus\b/gi, "faturação externa")
    .replace(/\bvendus_api_key\b/gi, "integração fiscal")
    .trim();
}
