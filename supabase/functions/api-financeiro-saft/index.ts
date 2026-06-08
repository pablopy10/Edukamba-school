/**
 * GET /api/financeiro/saft?mes=&ano=
 * Proxy seguro: usa a API Key Vendus da escola activa e devolve XML SAF-T.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { VendusService, VendusApiError } from "../_shared/vendusService.ts";
import {
  authenticateStaffRequest,
  logVendusFailure,
  resolveSchoolVendusKey,
  vendusCorsHeaders,
  vendusCorsJson,
} from "../_shared/vendusAuth.ts";
import { externalBillingUserMessage } from "../_shared/externalBillingUserMessage.ts";

function parsePeriod(url: URL): { mes: number; ano: number } | { error: string } {
  const mes = Number(url.searchParams.get("mes") ?? url.searchParams.get("month"));
  const ano = Number(url.searchParams.get("ano") ?? url.searchParams.get("year"));
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return { error: "Parâmetro 'ano' inválido (2000-2100)." };
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { error: "Parâmetro 'mes' inválido (1-12)." };
  }
  return { mes, ano };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: vendusCorsHeaders });
  if (req.method !== "GET") return vendusCorsJson({ error: "Method not allowed" }, 405);

  let admin: ReturnType<typeof createClient> | null = null;
  let schoolId = "";

  try {
    const auth = await authenticateStaffRequest(req);
    if (!auth.ok) return auth.response;
    admin = auth.admin;

    const period = parsePeriod(new URL(req.url));
    if ("error" in period) return vendusCorsJson({ error: period.error }, 400);

    const schoolCtx = await resolveSchoolVendusKey(admin, auth.userId);
    if (!schoolCtx.ok) return schoolCtx.response;
    schoolId = schoolCtx.schoolId;

    const vendus = new VendusService(schoolCtx.vendusApiKey);
    const result = await vendus.descarregarSaft(period.mes, period.ano);
    const fn = `SAFT_Vendus_${period.ano}-${String(period.mes).padStart(2, "0")}.xml`;

    return new Response(result.xml, {
      status: 200,
      headers: {
        ...vendusCorsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fn}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof VendusApiError ? (e.status ?? 502) : 500;
    console.error("api-financeiro-saft error:", msg, e);

    if (admin && schoolId) {
      await logVendusFailure(admin, {
        schoolId,
        operation: "download_saft",
        errorMessage: msg,
        paymentId: null,
        httpStatus: e instanceof VendusApiError ? e.status ?? null : null,
        responsePayload: e instanceof VendusApiError ? e.vendusPayload : undefined,
      });
    }

    return vendusCorsJson(
      { error: externalBillingUserMessage(msg) },
      status >= 400 && status < 600 ? status : 500,
    );
  }
});
