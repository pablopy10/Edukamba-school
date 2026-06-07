/**
 * Tipos da integração Vendus Angola (contrato partilhado frontend ↔ Edge Functions).
 * A classe VendusService (Axios) está em `supabase/functions/_shared/vendusService.ts`.
 */
export type VendusDocumentType = "FT" | "FR";

export type DadosClienteVendus = {
  profileId: string;
  nome: string;
  nif: string | null;
  email: string | null;
  vendusClientId?: string | null;
};

export type ItemFaturaVendus = {
  titulo: string;
  referencia?: string;
  quantidade?: number | string;
  precoBruto: number | string;
  taxExemption?: string | null;
  taxExemptionLaw?: string | null;
  descontoValor?: number | string | null;
  descontoPercentagem?: number | string | null;
};

export type PagamentoVendus = {
  id: string;
  valor: number | string;
  dataVencimento?: string;
};

export type DadosFaturaPropinas = {
  tipo: VendusDocumentType;
  clientId: string;
  itens: ItemFaturaVendus[];
  pagamentos?: PagamentoVendus[];
  descontoValor?: number | string | null;
  descontoPercentagem?: number | string | null;
  data?: string;
  dataFornecimento?: string;
  notas?: string;
  referenciaExterna?: string;
  registerId?: number | string;
};

export type ResultadoClienteVendus = {
  vendusClientId: string;
  criado: boolean;
};

export type ResultadoFaturaVendus = {
  documentId: string;
  documentNumber: string;
  pdfUrl: string;
  tipo: string;
  valorBruto?: string;
};

export type ResultadoSaftVendus = {
  ano: number;
  mes: number;
  xml: string;
};

export type VendusBillingAction =
  | "criar_ou_procurar_cliente"
  | "emitir_fatura_propinas"
  | "descarregar_saft"
  | "download_pdf";
