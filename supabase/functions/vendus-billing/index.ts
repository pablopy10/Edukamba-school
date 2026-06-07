/**
 * Rotas API Vendus (proxy seguro com API Key da escola em background).
 *
 * Body JSON:
 * - action: "criar_ou_procurar_cliente" | "emitir_fatura_propinas" | "descarregar_saft" | "download_pdf"
 * - ... parâmetros específicos por acção
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  VendusService,
  VendusApiError,
  type DadosClienteVendus,
  type DadosFaturaPropinas,
} from "../_shared/vendusService.ts";
import {
  authenticateStaffRequest,
  logVendusFailure,
  resolveSchoolVendusKey,
  vendusCorsHeaders,
  vendusCorsJson,
} from "../_shared/vendusAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: vendusCorsHeaders });
  if (req.method !== "POST") return vendusCorsJson({ error: "Method not allowed" }, 405);

  let admin: ReturnType<typeof createClient> | null = null;
  let schoolId = "";
  let operation = "unknown";

  try {
    const auth = await authenticateStaffRequest(req);
    if (!auth.ok) return auth.response;
    admin = auth.admin;

    const body = await req.json().catch(() => ({}));
    operation = String(body.action ?? "").trim();
    if (!operation) return vendusCorsJson({ error: "Campo 'action' é obrigatório." }, 400);

    const schoolCtx = await resolveSchoolVendusKey(admin, auth.userId, body.school_id);
    if (!schoolCtx.ok) return schoolCtx.response;
    schoolId = schoolCtx.schoolId;

    const vendus = new VendusService(schoolCtx.vendusApiKey);

    switch (operation) {
      case "criar_ou_procurar_cliente": {
        const dados: DadosClienteVendus = {
          profileId: String(body.profile_id ?? "").trim(),
          nome: String(body.nome ?? body.name ?? "").trim(),
          nif: body.nif != null ? String(body.nif).trim() : null,
          email: body.email != null ? String(body.email).trim() : null,
          vendusClientId: body.vendus_client_id != null ? String(body.vendus_client_id).trim() : null,
        };
        if (!dados.profileId) return vendusCorsJson({ error: "profile_id é obrigatório." }, 400);
        if (!dados.nome) return vendusCorsJson({ error: "nome é obrigatório." }, 400);

        let existingClientId = dados.vendusClientId;
        if (!existingClientId) {
          const { data: prof } = await admin
            .from("profiles")
            .select("vendus_client_id")
            .eq("id", dados.profileId)
            .maybeSingle();
          existingClientId = prof?.vendus_client_id ?? null;
          dados.vendusClientId = existingClientId;
        }

        const result = await vendus.criarOuProcurarCliente(dados);

        if (result.criado || result.vendusClientId !== existingClientId) {
          await admin
            .from("profiles")
            .update({ vendus_client_id: result.vendusClientId })
            .eq("id", dados.profileId);
        }

        return vendusCorsJson({ ok: true, ...result });
      }

      case "emitir_fatura_propinas": {
        const dados = body.dados_fatura as DadosFaturaPropinas | undefined;
        if (!dados?.clientId?.trim()) {
          return vendusCorsJson({ error: "dados_fatura.clientId é obrigatório." }, 400);
        }
        if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
          return vendusCorsJson({ error: "dados_fatura.itens deve conter pelo menos um item." }, 400);
        }
        if (!dados.tipo) dados.tipo = "FR";

        const result = await vendus.emitirFaturaPropinas(dados);
        return vendusCorsJson({ ok: true, ...result });
      }

      case "descarregar_saft": {
        const mes = Number(body.mes ?? body.month);
        const ano = Number(body.ano ?? body.year);
        const result = await vendus.descarregarSaft(mes, ano);
        return vendusCorsJson({ ok: true, ...result });
      }

      case "download_pdf": {
        const documentId = String(body.document_id ?? "").trim();
        if (!documentId) return vendusCorsJson({ error: "document_id é obrigatório." }, 400);

        const pdfUrl = vendus.getPdfUrl(documentId);
        const pdfRes = await fetch(pdfUrl, {
          headers: {
            Authorization: "Basic " + btoa(`${schoolCtx.vendusApiKey}:`),
          },
        });
        if (!pdfRes.ok) {
          const errText = await pdfRes.text().catch(() => "");
          throw new VendusApiError(
            `Falha ao obter PDF Vendus (${pdfRes.status}).`,
            pdfRes.status,
            errText.slice(0, 500),
          );
        }
        const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            ...vendusCorsHeaders,
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="vendus-${documentId}.pdf"`,
          },
        });
      }

      default:
        return vendusCorsJson({ error: `Acção desconhecida: ${operation}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof VendusApiError ? (e.status ?? 502) : 500;
    console.error(`vendus-billing [${operation}] error:`, msg, e);

    if (admin && schoolId) {
      await logVendusFailure(admin, {
        schoolId,
        operation,
        errorMessage: msg,
        paymentId: null,
        httpStatus: e instanceof VendusApiError ? e.status ?? null : null,
        responsePayload: e instanceof VendusApiError ? e.vendusPayload : undefined,
      });
    }

    return vendusCorsJson({ error: msg, operation }, status >= 400 && status < 600 ? status : 500);
  }
});
