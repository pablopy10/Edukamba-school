/**
 * Motor de Faturação Recorrente — Cron mensal (dia 1) ou invocação manual.
 * Gera FTs em lote para todos os alunos activos com propinas pendentes no mês corrente.
 * Regista débito na conta corrente de cada aluno.
 *
 * Requer: AGT_RSA_PRIVATE_KEY_PEM nas secrets.
 * Body opcional: { school_id?, month?, year? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePrivateKeyPem(raw: string): string {
  let pem = raw.trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1).trim();
  }
  return pem.replace(/\\n/g, "\n").trim();
}

async function sha1HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function signPlaintextRSA_SHA1(plaintext: string, pem: string): string {
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(pem);
  } catch {
    const der = forge.util.decode64(
      pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    );
    const asn1 = forge.asn1.fromDer(der);
    privateKey = forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
  }
  const md = forge.md.sha1.create();
  md.update(plaintext, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

function formatTotalForSigning(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

function formatIssuedAt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function resolveNif(studentTaxId: string | null, parentTaxId: string | null): string {
  const isValid = (v: string | null): boolean => {
    if (!v?.trim()) return false;
    const t = v.trim();
    return /^[0-9]{9,10}$/.test(t) || /^[0-9A-Za-z]{6,14}$/.test(t);
  };
  if (isValid(studentTaxId)) return studentTaxId!.trim().toUpperCase();
  if (isValid(parentTaxId)) return parentTaxId!.trim().toUpperCase();
  return "999999999";
}

type FeeRow = {
  id: string;
  student_id: string;
  amount_due: number;
  due_date: string;
  month_index: number;
  academic_year_id: string;
  student: {
    full_name: string;
    tax_id: string | null;
    parent_id: string | null;
    school_id: string;
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  try {
    const pemRaw = Deno.env.get("AGT_RSA_PRIVATE_KEY_PEM") ?? "";
    const pem = normalizePrivateKeyPem(pemRaw);
    if (!pem || !/PRIVATE KEY/.test(pem)) {
      return corsJson({ error: "AGT_RSA_PRIVATE_KEY_PEM não configurada." }, 503);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    let body: { school_id?: string; month?: number; year?: number } = {};
    try { body = await req.json(); } catch { /* empty ok */ }

    const now = new Date();
    const targetMonth = body.month ?? (now.getUTCMonth() + 1);
    const targetYear = body.year ?? now.getUTCFullYear();
    const invoiceDateYYYYMMDD = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;

    // Buscar propinas pendentes do mês alvo que ainda não têm fatura
    let feesQuery = admin
      .from("student_fees")
      .select(`
        id, student_id, amount_due, due_date, month_index, academic_year_id,
        student:students!inner(full_name, tax_id, parent_id, school_id)
      `)
      .eq("is_paid", false)
      .eq("month_index", targetMonth)
      .gt("amount_due", 0);

    if (body.school_id?.trim()) {
      feesQuery = feesQuery.eq("student:students.school_id", body.school_id.trim());
    }

    const { data: fees, error: feesErr } = await feesQuery;
    if (feesErr) return corsJson({ error: feesErr.message }, 500);
    if (!fees || fees.length === 0) {
      return corsJson({ ok: true, message: "Nenhuma propina pendente para faturar.", emitted: 0 });
    }

    // Agrupar por escola para manter cadeia de hash por série
    const bySchool = new Map<string, FeeRow[]>();
    for (const fee of fees as unknown as FeeRow[]) {
      const schoolId = fee.student?.school_id;
      if (!schoolId) continue;
      if (!bySchool.has(schoolId)) bySchool.set(schoolId, []);
      bySchool.get(schoolId)!.push(fee);
    }

    let totalEmitted = 0;
    const errors: string[] = [];

    for (const [schoolId, schoolFees] of bySchool) {
      // Verificar se já existem faturas recorrentes para este mês (evitar duplicados)
      const existingCheck = await admin
        .from("invoices")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("doc_type", "FT")
        .eq("invoice_date", invoiceDateYYYYMMDD)
        .in("student_id", schoolFees.map(f => f.student_id));

      const alreadyInvoiced = new Set((existingCheck.data ?? []).map(r => r.student_id));

      // Buscar último hash da série para encadeamento
      const { data: lastInv } = await admin
        .from("invoices")
        .select("digital_signature_sha1_b64, doc_number")
        .eq("school_id", schoolId)
        .eq("series", "EDK")
        .order("doc_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      let previousSignature = lastInv?.digital_signature_sha1_b64?.trim() ?? "";
      let lastDocNumber = lastInv?.doc_number ?? 0;

      // Buscar NIF dos encarregados (batch)
      const parentIds = [...new Set(schoolFees.map(f => f.student?.parent_id).filter(Boolean))] as string[];
      const { data: parents } = await admin
        .from("profiles")
        .select("id, tax_id")
        .in("id", parentIds);
      const parentTaxMap = new Map((parents ?? []).map(p => [p.id, p.tax_id]));

      // Emitir FTs em lote (sequencialmente para manter cadeia)
      for (const fee of schoolFees) {
        if (alreadyInvoiced.has(fee.student_id)) continue;

        try {
          // Reservar número
          const { data: slot, error: slotErr } = await admin.rpc("billing_reserve_next_doc_number", {
            _school_id: schoolId,
            _doc_type: "FT",
          });
          if (slotErr) { errors.push(`${fee.student?.full_name}: ${slotErr.message}`); continue; }
          const s = (slot as { serie: string; seq: number }[])?.[0];
          if (!s) { errors.push(`${fee.student?.full_name}: falha reserva número`); continue; }

          const series = s.serie;
          const seq = s.seq;
          const documentNumber = `FT ${series}/${seq}`;
          const issuedAt = new Date();
          const issuedAtStr = formatIssuedAt(issuedAt);
          const grossTotal = fee.amount_due;
          const totalStr = formatTotalForSigning(grossTotal);

          const parentTaxId = fee.student?.parent_id ? (parentTaxMap.get(fee.student.parent_id) ?? null) : null;
          const clienteNif = resolveNif(fee.student?.tax_id ?? null, parentTaxId);
          const clienteNome = fee.student?.full_name ?? "Aluno";

          // String de assinatura AGT
          const plaintext = `${invoiceDateYYYYMMDD};${issuedAtStr};${documentNumber};${totalStr};${previousSignature}`;
          const documentHash = await sha1HexUtf8(plaintext);
          const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);
          const hashControl = (((Math.max(seq, 1) - 1) % 10) + 1).toString();

          // Inserir fatura
          const { data: inv, error: insErr } = await admin.from("invoices").insert({
            school_id: schoolId,
            student_id: fee.student_id,
            series,
            doc_number: seq,
            doc_type: "FT",
            document_number: documentNumber,
            invoice_date: invoiceDateYYYYMMDD,
            invoice_issued_at: issuedAt.toISOString(),
            gross_total: grossTotal,
            net_total: grossTotal,
            tax_payable: 0,
            line_description: `Propina - ${String(targetMonth).padStart(2, "0")}/${targetYear}`,
            agt_signing_plaintext: plaintext,
            digital_signature_sha1_b64: signatureBase64,
            document_hash: documentHash,
            previous_document_hash: previousSignature || null,
            hash_control: hashControl,
            cliente_nome: clienteNome,
            cliente_nif: clienteNif,
          }).select("id").single();

          if (insErr) { errors.push(`${documentNumber}: ${insErr.message}`); continue; }

          // Inserir linha do documento
          await admin.from("invoice_lines").insert({
            invoice_id: inv!.id,
            line_number: 1,
            product_code: "SERV-EDUC-01",
            product_description: `Propina - ${String(targetMonth).padStart(2, "0")}/${targetYear}`,
            quantity: 1,
            unit_price: grossTotal,
            credit_amount: grossTotal,
            tax_type: "IVA",
            tax_country_region: "AO",
            tax_code: "ISE",
            tax_percentage: 0,
            tax_exemption_code: "M11",
            tax_exemption_reason: "Isenção no domínio da educação",
          });

          // Registar débito na conta corrente
          const { data: lastStmt } = await admin
            .from("account_statements")
            .select("balance_after")
            .eq("school_id", schoolId)
            .eq("student_id", fee.student_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const prevBalance = Number(lastStmt?.balance_after ?? 0);
          await admin.from("account_statements").insert({
            school_id: schoolId,
            student_id: fee.student_id,
            invoice_id: inv!.id,
            movement_type: "FT",
            description: `Propina ${String(targetMonth).padStart(2, "0")}/${targetYear} - ${documentNumber}`,
            debit_amount: grossTotal,
            credit_amount: 0,
            balance_after: prevBalance + grossTotal,
            reference_date: invoiceDateYYYYMMDD,
          });

          // Encadear para próxima fatura
          previousSignature = signatureBase64;
          lastDocNumber = seq;
          totalEmitted++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${fee.student?.full_name}: ${msg}`);
        }
      }
    }

    return corsJson({
      ok: true,
      emitted: totalEmitted,
      total_fees: fees.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("emit-recurring-invoices error:", msg);
    return corsJson({ error: msg }, 500);
  }
});
