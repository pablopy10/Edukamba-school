import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle2, FileSignature, AlertTriangle, Loader2, ArrowLeft, ExternalLink, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { SignatureCanvas } from "@/components/documents/SignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { uploadBlobToR2 } from "@/lib/r2/uploadFileToR2";

type DocCategory = "assinatura" | "formulario" | "informativo";

type SignatureField = {
  id: string;
  type: "signature" | "text";
  page: number;
  x: number; y: number; w: number; h: number;
  label: string;
};

type DocumentRow = {
  id: string;
  title: string;
  description: string | null;
  category: DocCategory;
  file_url: string | null;
  pdf_template_url: string | null;
  content_text: string | null;
  signature_fields: SignatureField[] | null;
  required: boolean;
  expires_at: string | null;
};

// ── Embed signature image + text field values into the PDF ────────────────────
async function buildSignedPdf(
  pdfUrl: string,
  signatureDataUrl: string | null,
  fields: SignatureField[],
  textValues: Record<string, string>,
): Promise<Uint8Array> {
  const res = await fetch(pdfUrl);
  const pdfBytes = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let pngImage = null;
  if (signatureDataUrl) {
    const base64 = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    pngImage = await pdfDoc.embedPng(imgBytes);
  }

  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const page = pages[field.page - 1];
    if (!page) continue;

    const { width: pw, height: ph } = page.getSize();
    // Coords are % from top-left; PDF origin is bottom-left → flip Y
    const x = (field.x / 100) * pw;
    const y = ph - ((field.y + field.h) / 100) * ph;
    const w = (field.w / 100) * pw;
    const h = (field.h / 100) * ph;

    if (field.type === "signature" && pngImage) {
      page.drawImage(pngImage, { x, y, width: w, height: h });
    } else if (field.type === "text") {
      const value = (textValues[field.id] ?? "").trim();
      if (value) {
        const fontSize = Math.max(8, Math.min(h * 0.55, 13));
        page.drawText(value, {
          x: x + 3,
          y: y + 4,
          size: fontSize,
          font: helvetica,
          color: rgb(0, 0, 0),
          maxWidth: w - 6,
        });
      }
    }
  }

  return pdfDoc.save();
}

type RequestRow = {
  id: string;
  document_id: string;
  status: string;
  signature_data: string | null;
  signer_name: string | null;
  signed_at: string | null;
  student: { full_name: string } | null;
  document: DocumentRow | null;
};

const CATEGORY_LABEL: Record<DocCategory, string> = {
  assinatura: "Pedido de Assinatura",
  formulario: "Formulário",
  informativo: "Informativo",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function DocumentSign() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [request, setRequest] = useState<RequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [accepted, setAccepted] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [textFieldValues, setTextFieldValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("document_requests")
        .select("*, document:document_id(id,title,description,category,file_url,pdf_template_url,content_text,signature_fields,required,expires_at), student:student_id(full_name)")
        .eq("id", requestId)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      const row = data as unknown as RequestRow;
      setRequest(row);
      // Pre-fill signer name from profile
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.full_name) setSignerName(profile.full_name);
      }
      // Already responded?
      if (row.status !== "pending") setSubmitted(true);
      setLoading(false);
    })();
  }, [requestId, user?.id]);

  const doc = request?.document;
  const isSignature = doc?.category === "assinatura";
  const isForm = doc?.category === "formulario";
  const isInfoOnly = doc?.category === "informativo";

  // Text fields configured by the admin on this document
  const textFields = useMemo(
    () => (doc?.signature_fields ?? []).filter((f) => f.type === "text"),
    [doc?.signature_fields],
  );

  const allTextFieldsFilled = textFields.every(
    (f) => (textFieldValues[f.id] ?? "").trim().length > 0,
  );

  const canSubmit =
    accepted &&
    signerName.trim().length > 0 &&
    (!isSignature || signatureData !== null) &&
    allTextFieldsFilled;

  const handleSubmit = async () => {
    if (!request || !canSubmit) return;
    setSubmitting(true);

    const newStatus = isSignature ? "signed" : isForm ? "submitted" : "signed";
    const now = new Date().toISOString();

    // ── Embed signature + text values into PDF (if template + fields configured) ─
    let builtSignedPdfUrl: string | null = null;

    const hasTextValues = Object.values(textFieldValues).some((v) => v.trim());
    if (
      doc?.pdf_template_url &&
      Array.isArray(doc.signature_fields) &&
      doc.signature_fields.length > 0 &&
      (signatureData || hasTextValues)
    ) {
      try {
        setSubmitStep("A incorporar dados no PDF…");
        const pdfBytes = await buildSignedPdf(
          doc.pdf_template_url,
          signatureData,
          doc.signature_fields,
          textFieldValues,
        );

        setSubmitStep("A guardar PDF assinado…");
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        try {
          builtSignedPdfUrl = await uploadBlobToR2(blob, `signed-${request.id}.pdf`, {
            prefix: "documents",
            contentType: "application/pdf",
          });
          setSignedPdfUrl(builtSignedPdfUrl);
        } catch (e) {
          console.warn("Signed PDF upload error:", e instanceof Error ? e.message : e);
        }
      } catch (e) {
        console.warn("PDF signing failed (will still save signature image):", e);
      }
    }

    setSubmitStep("A registar assinatura…");

    const { error } = await supabase
      .from("document_requests")
      .update({
        status: newStatus,
        signature_data: signatureData ?? null,
        signed_pdf_url: builtSignedPdfUrl,
        signer_name: signerName.trim(),
        signed_at: now,
        responded_at: now,
      })
      .eq("id", request.id);

    setSubmitting(false);
    setSubmitStep("");

    if (error) {
      toast({ title: "Erro ao submeter", description: error.message, variant: "destructive" });
      return;
    }

    setSubmitted(true);
    setRequest((r) => r ? { ...r, status: newStatus, signed_at: now } : r);
    toast({ title: isSignature ? "Documento assinado com sucesso!" : "Resposta submetida!" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <AlertTriangle className="h-12 w-12 text-pastel-yellow-foreground" strokeWidth={1.5} />
        <h1 className="text-xl font-bold">Documento não encontrado</h1>
        <p className="text-sm text-muted-foreground">Este pedido não existe ou já não está disponível.</p>
        <Button variant="outline" onClick={() => navigate("/documentos")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pastel-green/20">
          <CheckCircle2 className="h-10 w-10 text-pastel-green-foreground" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isInfoOnly ? "Leitura confirmada!" : isSignature ? "Documento assinado!" : "Formulário submetido!"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {doc.title}
          </p>
          {request?.signed_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Registado em {formatDate(request.signed_at)}
            </p>
          )}
        </div>
        {/* Signed PDF download */}
        {signedPdfUrl && (
          <a
            href={signedPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-pastel-blue/40 bg-pastel-blue/10 px-4 py-3 text-sm font-semibold text-pastel-blue-foreground hover:bg-pastel-blue/20"
          >
            <Download className="h-4 w-4" />
            Descarregar PDF assinado
          </a>
        )}

        {/* Signature image preview (when no PDF or PDF signing failed) */}
        {!signedPdfUrl && request?.signature_data && (
          <div className="w-full max-w-sm rounded-2xl border border-pastel-green/40 bg-pastel-green/10 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Assinatura registada</p>
            <img src={request.signature_data} alt="Assinatura" className="mx-auto max-h-20 object-contain" />
          </div>
        )}

        <Button onClick={() => navigate("/documentos")} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Ir para Documentos
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 shadow-soft backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={() => navigate("/documentos")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Documentos
          </button>
          <span className="text-sm font-bold tracking-tight text-foreground">Edukamba</span>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {/* Document header card */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pastel-blue/20">
              <FileSignature className="h-6 w-6 text-pastel-blue-foreground" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[doc.category]}
              </p>
              <h1 className="mt-0.5 text-lg font-bold text-foreground">{doc.title}</h1>
              {request?.student && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Aluno: <span className="font-medium text-foreground">{request.student.full_name}</span>
                </p>
              )}
              {doc.expires_at && (
                <p className={cn(
                  "mt-1 text-xs",
                  new Date(doc.expires_at) < new Date() ? "text-pastel-pink-foreground" : "text-muted-foreground"
                )}>
                  Prazo: {new Date(doc.expires_at).toLocaleDateString("pt-PT")}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Document content */}
        <div className="mb-4 rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Conteúdo do documento</h2>
          </div>

          {/* PDF viewer */}
          {(doc.pdf_template_url || doc.file_url) && (
            <div className="p-4">
              <a
                href={doc.pdf_template_url ?? doc.file_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
              >
                <FileText className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                Abrir documento em separador
                <ExternalLink className="ml-auto h-4 w-4 text-muted-foreground" />
              </a>

              {/* Inline PDF iframe (works on desktop) */}
              <div className="mt-3 hidden overflow-hidden rounded-xl border border-border sm:block" style={{ height: 480 }}>
                <iframe
                  src={doc.pdf_template_url ?? doc.file_url!}
                  className="h-full w-full"
                  title="Documento"
                />
              </div>
            </div>
          )}

          {/* Text content */}
          {doc.content_text && (
            <div className="max-h-80 overflow-y-auto px-5 py-4">
              <div className="prose prose-sm max-w-none text-foreground">
                {doc.content_text.split("\n").map((line, i) => (
                  <p key={i} className={cn("mb-2 text-sm leading-relaxed", !line.trim() && "mb-4")}>
                    {line || <br />}
                  </p>
                ))}
              </div>
            </div>
          )}

          {doc.description && !doc.content_text && !(doc.pdf_template_url || doc.file_url) && (
            <div className="px-5 py-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{doc.description}</p>
            </div>
          )}
        </div>

        {/* Acceptance + Signature form */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {isSignature ? "Assinar documento" : isForm ? "Submeter formulário" : "Confirmar leitura"}
          </h2>

          {/* Signer name */}
          <div className="mb-4 space-y-1.5">
            <Label>Nome completo *</Label>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Escreva o seu nome completo"
            />
          </div>

          {/* Text fields configured by the admin */}
          {textFields.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-pastel-yellow/40 bg-pastel-yellow/10 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Campos a preencher
              </p>
              {textFields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label>{field.label} *</Label>
                  <Input
                    value={textFieldValues[field.id] ?? ""}
                    onChange={(e) =>
                      setTextFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    placeholder={field.label}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Acceptance checkbox */}
          <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-pastel-blue-foreground"
            />
            <span className="text-sm leading-relaxed text-foreground">
              {isSignature
                ? "Li o documento acima na íntegra e concordo em assinar digitalmente."
                : isForm
                  ? "Li o formulário e confirmo que as informações prestadas são verdadeiras."
                  : "Confirmo que li e tomei conhecimento do conteúdo deste documento."}
              {doc.required && <span className="ml-1 text-pastel-pink-foreground font-medium">(obrigatório)</span>}
            </span>
          </label>

          {/* Signature canvas — only for signature type */}
          {isSignature && (
            <div className="mb-5">
              <SignatureCanvas
                onSave={(data) => setSignatureData(data)}
                onClear={() => setSignatureData(null)}
                disabled={!accepted}
              />
              {!accepted && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Aceite os termos acima para desbloquear a área de assinatura.
                </p>
              )}
            </div>
          )}

          {/* Submit button */}
          <Button
            className={cn(
              "w-full rounded-full font-semibold",
              canSubmit
                ? "bg-pastel-green text-pastel-green-foreground hover:opacity-90"
                : "opacity-50 cursor-not-allowed",
            )}
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {submitStep || "A processar…"}</>
            ) : isSignature ? (
              <><CheckCircle2 className="mr-2 h-4 w-4" /> Assinar e enviar</>
            ) : isForm ? (
              <><CheckCircle2 className="mr-2 h-4 w-4" /> Submeter formulário</>
            ) : (
              <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirmar leitura</>
            )}
          </Button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            A sua assinatura digital é juridicamente vinculativa de acordo com a legislação aplicável.
            A data, hora e identificação são registadas automaticamente.
          </p>
        </div>
      </main>
    </div>
  );
}
