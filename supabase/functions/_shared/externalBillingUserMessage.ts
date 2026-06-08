/** Evita substituir o nome do fornecedor dentro de URLs (ex.: api.vendus.ao). */
function maskVendorBrand(text: string): string {
  return text.replace(/\bVendus\b/gi, (match, offset, full) => {
    if (offset > 0 && full[offset - 1] === ".") return match;
    return "faturação externa";
  });
}

/** Remove referências ao fornecedor interno de faturação externa nas mensagens visíveis ao utilizador. */
export function externalBillingUserMessage(raw: string): string {
  const trimmed = raw.trim();
  if (/Register'?s type must be \[API\]/i.test(trimmed)) {
    return "A conta de faturação externa não tem uma caixa API activa. Peça ao administrador para criar ou activar uma caixa do tipo API.";
  }
  if (/Falha ao obter PDF \(404\)/i.test(trimmed)) {
    return "PDF da fatura não encontrado. Se a conta está em modo teste, confirme que a caixa API está em Formação/Testes.";
  }
  if (/No data/i.test(trimmed)) {
    return "Não existe caixa do tipo API activa. No Vendus: Configuração > Definições > Lojas e Caixas — crie uma caixa com tipo «API (Integração Programática)».";
  }
  if (/Não existe caixa do tipo API/i.test(trimmed)) {
    return maskVendorBrand(trimmed);
  }

  return maskVendorBrand(trimmed
    .replace(/^Vendus:\s*/gi, "")
    .replace(/\bvendus_api_key\b/gi, "integração fiscal")
    .replace(/\{"code":"[^"]+","message":"([^"]+)"\}/g, "$1"))
    .trim();
}
