/**
 * Emite faturas (FT AGT) para pagamentos já validados — um ou vários por pedido.
 * JWT do utilizador staff (RLS às tabelas). Secret: AGT_RSA_PRIVATE_KEY_PEM (PKCS#8 RSA, assinatura SHA-1 PKCS#1).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import forge from "https://esm.sh/node-forge@1.3.1";
import {
  buildOfficialFiscalInvoicePdfBytes,
  invoiceRowToPdfPayload,
} from "./fiscalInvoicePdf.ts";
import { sendInvoiceIssuedEmailForId } from "../_shared/sendInvoiceIssuedEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONSUMER_FALLBACK_NIF = "999999999";

type EmitResult = {
  payment_id: string;
  status: "emitted" | "skipped" | "error";
  detail?: string;
  /** UUID da FT na tabela invoices (novo ou já existente no caso ignorado por duplicado). */
  invoice_id?: string;
  /** Ex.: FT EDK/42 — apenas quando invoice_id existe. */
  document_number?: string;
};

type PaymentRow = {
  id: string;
  school_id: string;
  status: string;
  amount_paid: number;
  validated_at: string | null;
  payment_date: string | null;
  student_fee_id: string | null;
  activity_fee_id: string | null;
  transport_fee_id: string | null;
  enrollment_fee_id: string | null;
  meal_fee_id: string | null;
  event_fee_id: string | null;
};

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw.replace(/\D/g, "").trim();
}

function resolveClienteNif(studentTaxId: string | null | undefined, parentTaxId: string | null | undefined): string {
  const normalize = (raw: string | null | undefined): string => {
    if (!raw) return "";
    return raw.trim();
  };
  // Aceitar NIF numérico (9-10 dígitos) ou BI alfanumérico angolano (ex: 001699891LA037)
  const isValidNif = (val: string): boolean => {
    if (!val) return false;
    if (/^[0-9]{9,10}$/.test(val)) return true;
    if (/^[0-9A-Za-z]{6,14}$/.test(val)) return true;
    return false;
  };
  const fromStudent = normalize(studentTaxId);
  if (isValidNif(fromStudent)) return fromStudent.toUpperCase();
  const fromParent = normalize(parentTaxId);
  if (isValidNif(fromParent)) return fromParent.toUpperCase();
  return CONSUMER_FALLBACK_NIF;
}

/** Ex.: número completo tipo «FT EDK/42». */
function formatDocumentNumber(series: string, docNumber: number): string {
  const s = series.trim().toUpperCase();
  return `FT ${s}/${docNumber}`;
}

/** Data da fatura (YYYY-MM-DD) sem hora. */
function formatInvoiceDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d.includes("T") ? d : `${d}T12:00:00`) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildAgtSigningPlaintext(input: {
  invoiceDateYYYYMMDD: string;
  issuedAtISO: string;
  documentNumberFull: string;
  totalAmountString: string;
  previousDocumentHash: string;
}): string {
  const { invoiceDateYYYYMMDD, issuedAtISO, documentNumberFull, totalAmountString, previousDocumentHash } = input;
  const prev = (previousDocumentHash ?? "").trim();
  // Formato AGT: YYYY-MM-DDTHH:MM:SS (sem milissegundos, sem Z)
  const issuedAtClean = issuedAtISO.replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
  return `${invoiceDateYYYYMMDD};${issuedAtClean};${documentNumberFull};${totalAmountString};${prev}`;
}

async function sha1HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function assertInvoiceDateChronology(lastIssuedDateYYYYMMDD: string | null | undefined, newDateYYYYMMDD: string): void {
  if (!lastIssuedDateYYYYMMDD || !lastIssuedDateYYYYMMDD.trim()) return;
  const a = lastIssuedDateYYYYMMDD.slice(0, 10);
  const b = newDateYYYYMMDD.slice(0, 10);
  if (b < a) {
    throw new Error(
      `Cronologia fiscal: a data (${b}) não pode ser anterior ao último documento emitido (${a}).`,
    );
  }
}

function formatTotalForSigning(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** Secrets Supabase podem guardar PEM numa linha com \\n literais. */
function normalizePrivateKeyPem(raw: string): string {
  let pem = raw.trim();
  if (!pem) return "";
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim();
  }
  return pem.replace(/\\n/g, "\n").trim();
}

function assertPrivateKeyPem(pem: string): void {
  if (!pem || !/PRIVATE KEY/.test(pem)) {
    throw new Error(
      "AGT_RSA_PRIVATE_KEY_PEM inválida ou vazia. Configure a chave RSA nas secrets do Supabase (Project Settings → Edge Functions).",
    );
  }
}

/** Assinatura RSA-SHA1 PKCS#1 v1.5 (AGT). Aceita PEM PKCS#8 e «RSA PRIVATE KEY» (PKCS#1). */
function signPlaintextRSA_SHA1_PKCS1(plaintext: string, pemRaw: string): string {
  const pem = normalizePrivateKeyPem(pemRaw);
  assertPrivateKeyPem(pem);
  let privateKey: ReturnType<typeof forge.pki.privateKeyFromPem>;
  try {
    privateKey = forge.pki.privateKeyFromPem(pem);
  } catch {
    throw new Error(
      "Não foi possível ler AGT_RSA_PRIVATE_KEY_PEM. Exporte com: openssl pkcs8 -topk8 -nocrypt -in chave_rsa.pem -out chave_agt.pem",
    );
  }
  const md = forge.md.sha1.create();
  md.update(plaintext, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

function formatSigningErrorDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ASN\.1|DER message is incomplete|privateKeyFromPem/i.test(msg)) {
    return (
      "Chave RSA fiscal (AGT_RSA_PRIVATE_KEY_PEM) inválida ou em formato incorrecto. " +
      "Nas secrets do Supabase, cole o PEM completo (BEGIN … END) ou use PKCS#8: " +
      "openssl pkcs8 -topk8 -nocrypt -in chave.pem -out chave_agt.pem"
    );
  }
  if (/AGT_RSA_PRIVATE_KEY_PEM/i.test(msg)) return msg;
  return msg;
}

type FiscalContext = {
  student_id: string;
  parent_profile_id: string | null;
  cliente_nome: string;
  student_tax_id: string | null;
  parent_tax_id: string | null;
  line_description: string;
  /** Percentagem de IVA: 0 para isento (propinas/matrículas), 14 para extracurriculares/transportes/refeições */
  tax_percentage: number;
  tax_code: string;
  tax_exemption_code: string | null;
};

async function resolveFiscalContext(
  sb: ReturnType<typeof createClient>,
  payment: PaymentRow,
): Promise<FiscalContext> {
  let studentId: string | null = null;
  let lineDescription = "Propina / serviços educativos";

  if (payment.student_fee_id) {
    const { data: row, error } = await sb.from("student_fees").select("student_id").eq("id", payment.student_fee_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    studentId = row?.student_id ?? null;
    lineDescription = "Propina / serviços educativos";
  } else if (payment.activity_fee_id) {
    const { data: row, error } = await sb
      .from("activity_fees")
      .select("student_id, activity_id")
      .eq("id", payment.activity_fee_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    studentId = row?.student_id ?? null;
    let actName = "atividade";
    const activityId = (row as { activity_id?: string | null } | null)?.activity_id;
    if (activityId) {
      const { data: act, error: actErr } = await sb
        .from("extracurricular_activities")
        .select("name")
        .eq("id", activityId)
        .maybeSingle();
      if (actErr) throw new Error(actErr.message);
      actName = act?.name?.trim() || actName;
    }
    lineDescription = `Atividade extracurricular (${actName})`;
  } else if (payment.transport_fee_id) {
    const { data: row, error } = await sb
      .from("transport_fees")
      .select("student_id, route:transport_routes(name)")
      .eq("id", payment.transport_fee_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    studentId = row?.student_id ?? null;
    const routeName = (row as { route?: { name: string | null } | null })?.route?.name?.trim() || "rota";
    lineDescription = `Transporte escolar (${routeName})`;
  } else if (payment.enrollment_fee_id) {
    const { data: row, error } = await sb
      .from("enrollment_fees")
      .select("student_id, fee_type")
      .eq("id", payment.enrollment_fee_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    studentId = row?.student_id ?? null;
    const ft = (row as { fee_type?: string } | null)?.fee_type;
    lineDescription = ft === "RENEWAL" ? "Renovação de matrícula" : "Taxa de matrícula";
  } else if (payment.meal_fee_id) {
    const { data: row, error } = await sb
      .from("meal_fees")
      .select("student_id, meal_program:meal_programs(name)")
      .eq("id", payment.meal_fee_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    studentId = row?.student_id ?? null;
    const pname = (row as { meal_program?: { name: string | null } | null })?.meal_program?.name?.trim();
    lineDescription = pname ? `Refeições escolares (${pname})` : "Refeições escolares";
  } else if (payment.event_fee_id) {
    const { data: row, error } = await sb
      .from("event_fees")
      .select("student_id, event:events(title)")
      .eq("id", payment.event_fee_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    studentId = row?.student_id ?? null;
    const t = (row as { event?: { title: string | null } | null })?.event?.title?.trim();
    lineDescription = t ? `Evento escolar (${t})` : "Evento escolar";
  } else {
    throw new Error("Pagamento sem cobrança associada (propina / atividade / transporte / matrícula / refeições / evento).");
  }

  if (!studentId) throw new Error("Não foi possível resolver o aluno deste pagamento.");

  // Determinar IVA: propinas e matrículas são isentas; extracurriculares, transportes, refeições e eventos têm IVA 14%
  const isExempt = !!(payment.student_fee_id || payment.enrollment_fee_id);
  const taxPercentage = isExempt ? 0 : 14;
  const taxCode = isExempt ? "ISE" : "NOR";
  const taxExemptionCode = isExempt ? "M11" : null;

  const { data: st, error: stErr } = await sb
    .from("students")
    .select("id, full_name, tax_id, parent_id")
    .eq("id", studentId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  if (!st?.id) throw new Error("Aluno não encontrado.");

  let parentTax: string | null = null;
  if (st.parent_id) {
    const { data: prof, error: pErr } = await sb.from("profiles").select("tax_id").eq("id", st.parent_id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    parentTax = prof?.tax_id ?? null;
  }

  return {
    student_id: st.id,
    parent_profile_id: st.parent_id ?? null,
    cliente_nome: st.full_name?.trim() || "Cliente",
    student_tax_id: st.tax_id ?? null,
    parent_tax_id: parentTax,
    line_description: lineDescription,
    tax_percentage: taxPercentage,
    tax_code: taxCode,
    tax_exemption_code: taxExemptionCode,
  };
}

function sortPaymentsForChain(rows: PaymentRow[]): PaymentRow[] {
  const bySchool = new Map<string, PaymentRow[]>();
  for (const p of rows) {
    const list = bySchool.get(p.school_id) ?? [];
    list.push(p);
    bySchool.set(p.school_id, list);
  }
  const out: PaymentRow[] = [];
  const schoolKeys = [...bySchool.keys()].sort((a, b) => a.localeCompare(b));
  for (const sid of schoolKeys) {
    const list = bySchool.get(sid) ?? [];
    list.sort((a, b) => {
      const ta = a.validated_at ? new Date(a.validated_at).getTime() : 0;
      const tb = b.validated_at ? new Date(b.validated_at).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
    out.push(...list);
  }
  return out;
}

async function emitOne(
  sb: ReturnType<typeof createClient>,
  adminSb: ReturnType<typeof createClient> | null,
  pem: string,
  payment: PaymentRow,
): Promise<EmitResult> {
  const payment_id = payment.id;
  try {
    if (payment.status !== "validado") {
      return { payment_id, status: "skipped", detail: `Estado não é validado (${payment.status}).` };
    }

    const billingClient = adminSb ?? sb;
    const { data: schoolBilling } = await billingClient
      .from("schools")
      .select("usa_faturacao_externa, vendus_api_key")
      .eq("id", payment.school_id)
      .maybeSingle();
    if (
      schoolBilling?.usa_faturacao_externa === true ||
      (schoolBilling?.vendus_api_key?.trim() ?? "") !== ""
    ) {
      return {
        payment_id,
        status: "skipped",
        detail: "Escola com faturação externa. O comprovativo é emitido via emit-payment-receipt.",
      };
    }

    const { data: existing, error: exErr } = await sb.from("invoices").select("id, document_number").eq("payment_id", payment_id)
      .maybeSingle();
    if (exErr) return { payment_id, status: "error", detail: exErr.message };
    if (existing?.id) {
      return {
        payment_id,
        status: "skipped",
        detail: "Já existe fatura para este pagamento.",
        invoice_id: String(existing.id),
        document_number: existing.document_number ?? undefined,
      };
    }

    const ctx = await resolveFiscalContext(sb, payment);
    const baseAmount = Number(payment.amount_paid);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return { payment_id, status: "error", detail: "Valor do pagamento inválido." };
    }

    // Calcular IVA e total bruto
    const ivaAmount = Math.round(baseAmount * ctx.tax_percentage / 100 * 100) / 100;
    const gross = Math.round((baseAmount + ivaAmount) * 100) / 100;

    // Codificar line_description com IVA para o PDF: "Desc:Valor:IvaPct"
    const taxSuffix = ctx.tax_percentage === 0 ? "0_M11" : String(ctx.tax_percentage);
    const lineDescriptionEncoded = `${ctx.line_description}:${formatTotalForSigning(baseAmount)}:${taxSuffix}`;

    const timeBasis = payment.validated_at ?? payment.payment_date ?? new Date().toISOString();
    const issuedAt = new Date(timeBasis);
    const invoiceDateYYYYMMDD = formatInvoiceDate(timeBasis);
    const cliente_nif = resolveClienteNif(ctx.student_tax_id, ctx.parent_tax_id);

    const { data: rpcRows, error: rpcErr } = await sb.rpc("billing_reserve_next_invoice", {
      _school_id: payment.school_id,
    });
    if (rpcErr) return { payment_id, status: "error", detail: rpcErr.message };
    const slot = (rpcRows as { serie: string; seq: number }[] | null)?.[0];
    if (!slot?.serie || slot.seq == null) {
      return { payment_id, status: "error", detail: "Falha a reservar número de fatura." };
    }
    const series = String(slot.serie).trim();
    const seq = Number(slot.seq);

    let previousDocumentHash = "";
    let previousHashForInsert: string | null = null;
    if (seq > 1) {
      // Tentar buscar a fatura imediatamente anterior (seq - 1)
      const { data: prev, error: prevErr } = await sb
        .from("invoices")
        .select("id, document_hash, digital_signature_sha1_b64, agt_signing_plaintext, document_number, doc_number")
        .eq("school_id", payment.school_id)
        .eq("series", series)
        .eq("doc_number", seq - 1)
        .maybeSingle();
      if (prevErr) return { payment_id, status: "error", detail: prevErr.message };

      // Se a fatura anterior exacta não existe, buscar a última existente na série
      const target = prev ?? (await (async () => {
        const { data: last } = await sb
          .from("invoices")
          .select("id, document_hash, digital_signature_sha1_b64, agt_signing_plaintext, document_number, doc_number")
          .eq("school_id", payment.school_id)
          .eq("series", series)
          .eq("invoice_status", "N")
          .order("doc_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        return last;
      })());

      if (target) {
        // AGT: o encadeamento usa a assinatura Base64 do documento anterior
        let h = target.digital_signature_sha1_b64?.trim() ?? "";
        if (!h) {
          h = target.document_hash?.trim() ?? "";
          if (!h && target.agt_signing_plaintext?.trim()) {
            h = await sha1HexUtf8(target.agt_signing_plaintext.trim());
            if (target.id) {
              await sb.from("invoices").update({ document_hash: h }).eq("id", target.id);
            }
          }
        }
        previousDocumentHash = h;
        previousHashForInsert = h;
      }
      // Se não existe nenhuma fatura na série, previousDocumentHash fica "" (primeira da série)
    }

    const { data: lastAny, error: lastErr } = await sb
      .from("invoices")
      .select("invoice_date")
      .eq("school_id", payment.school_id)
      .eq("series", series)
      .order("invoice_date", { ascending: false })
      .order("doc_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) return { payment_id, status: "error", detail: lastErr.message };
    assertInvoiceDateChronology(lastAny?.invoice_date ?? undefined, invoiceDateYYYYMMDD);

    const documentNumberFull = formatDocumentNumber(series, seq);
    const totalStr = formatTotalForSigning(gross);
    const issuedAtISO = issuedAt.toISOString();
    const plaintext = buildAgtSigningPlaintext({
      invoiceDateYYYYMMDD,
      issuedAtISO,
      documentNumberFull,
      totalAmountString: totalStr,
      previousDocumentHash,
    });

    const document_hash = await sha1HexUtf8(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1_PKCS1(plaintext, pem);
    const hash_control = (((Math.max(seq, 1) - 1) % 10) + 1).toString();

    const { data: inserted, error: insErr } = await sb.from("invoices").insert({
      school_id: payment.school_id,
      payment_id: payment.id,
      student_id: ctx.student_id,
      parent_profile_id: ctx.parent_profile_id,
      series,
      doc_number: seq,
      document_number: documentNumberFull,
      invoice_date: invoiceDateYYYYMMDD,
      invoice_issued_at: issuedAtISO,
      gross_total: gross,
      net_total: baseAmount,
      tax_payable: ivaAmount,
      line_description: lineDescriptionEncoded,
      exemption_code: ctx.tax_exemption_code ?? "M11",
      exemption_reason: ctx.tax_percentage === 0 ? "Isenção no domínio da educação" : null,
      agt_signing_plaintext: plaintext,
      digital_signature_sha1_b64: signatureBase64,
      document_hash,
      previous_document_hash: previousHashForInsert,
      hash_control,
      cliente_nome: ctx.cliente_nome,
      cliente_nif,
    }).select("*").single();

    if (insErr) {
      if (insErr.code === "23505") {
        return { payment_id, status: "skipped", detail: "Fatura duplicada (concorrência)." };
      }
      return { payment_id, status: "error", detail: insErr.message };
    }

    // Enviar email com PDF da fatura em anexo ao encarregado
    if (inserted?.id) {
      try {
        const emailClient = adminSb ?? sb;
        const pdfBytes = await buildOfficialFiscalInvoicePdfBytes(emailClient, invoiceRowToPdfPayload(inserted));
        await sendInvoiceIssuedEmailForId(emailClient, String(inserted.id), pdfBytes);
      } catch (emailErr) {
        // Falha no email não deve bloquear a emissão da fatura
        console.warn("Email da fatura falhou (não-bloqueante):", emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }

    return {
      payment_id,
      status: "emitted",
      invoice_id: inserted?.id ? String(inserted.id) : undefined,
      document_number: inserted?.document_number ?? documentNumberFull,
    };
  } catch (e) {
    return { payment_id, status: "error", detail: formatSigningErrorDetail(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  const pemRaw = Deno.env.get("AGT_RSA_PRIVATE_KEY_PEM") ?? "";
  const pemNormalized = normalizePrivateKeyPem(pemRaw);
  if (!pemNormalized || !/PRIVATE KEY/.test(pemNormalized)) {
    return corsJson({
      error:
        "AGT_RSA_PRIVATE_KEY_PEM não configurada ou inválida nas secrets (necessário PEM com BEGIN PRIVATE KEY ou BEGIN RSA PRIVATE KEY).",
      results: [],
    }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !anonKey) {
    return corsJson({ error: "Variáveis Supabase em falta" }, 500);
  }

  const adminSb = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "JSON inválido" }, 400);
  }

  const payment_ids = (body as { payment_ids?: unknown }).payment_ids;
  if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
    return corsJson({ error: "payment_ids[] obrigatório" }, 400);
  }

  const uniqueIds = [...new Set(payment_ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!uniqueIds.length) return corsJson({ error: "Nenhum id válido" }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

  const { data: rows, error: fetchErr } = await userClient
    .from("payments")
    .select(
      "id, school_id, status, amount_paid, validated_at, payment_date, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id",
    )
    .in("id", uniqueIds);

  if (fetchErr) return corsJson({ error: fetchErr.message, results: [] }, 400);

  const foundList = (rows ?? []) as PaymentRow[];
  const foundMap = new Map(foundList.map((r) => [r.id, r]));
  const results: EmitResult[] = [];

  for (const id of uniqueIds) {
    if (!foundMap.has(id)) {
      results.push({ payment_id: id, status: "error", detail: "Pagamento não encontrado ou sem permissão." });
    }
  }

  const chain = sortPaymentsForChain([...foundMap.values()]);
  for (const p of chain) {
    results.push(await emitOne(userClient, adminSb, pemNormalized, p));
  }

  return corsJson({ results });
});
