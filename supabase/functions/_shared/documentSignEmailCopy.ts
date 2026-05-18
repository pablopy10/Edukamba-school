import type { UserLocale } from "./normalizeUserLocale.ts";

function localeTag(locale: UserLocale): string {
  if (locale === "en") return "en";
  if (locale === "fr") return "fr";
  return "pt";
}

function localeDate(expiresAt: string, locale: UserLocale): string {
  try {
    const d = new Date(expiresAt);
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : locale === "en" ? "en-GB" : "pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return expiresAt;
  }
}

const COPY: Record<
  UserLocale,
  {
    category_assinatura: string;
    category_formulario: string;
    category_other: string;
    expiry_prefix: string;
    classroom: string;
    student: string;
    body_intro: Record<"assinatura" | "formulario" | "other", string>;
    cta: Record<"assinatura" | "formulario" | "other", string>;
    footer_hint: string;
    footer_auto: string;
    subject_suffix: Record<"assinatura" | "formulario" | "other", string>;
  }
> = {
  pt: {
    category_assinatura: "Pedido de Assinatura",
    category_formulario: "Formulário para Preenchimento",
    category_other: "Documento para Leitura",
    expiry_prefix: "Prazo:",
    classroom: "Turma:",
    student: "Educando(a):",
    body_intro: {
      assinatura: "Por favor, abra o link abaixo para visualizar o documento e assinar digitalmente.",
      formulario: "Por favor, abra o link abaixo para visualizar o documento e preencher o formulário.",
      other: "Por favor, abra o link abaixo para visualizar o documento e confirmar a leitura.",
    },
    cta: {
      assinatura: "✍️ Assinar documento",
      formulario: "📋 Preencher formulário",
      other: "📄 Confirmar leitura",
    },
    footer_hint: "Abre a app Edukamba se estiver instalada, ou o browser caso contrário.",
    footer_auto:
      "Este email foi enviado automaticamente pelo sistema Edukamba.<br />Por favor não responda diretamente a esta mensagem.",
    subject_suffix: {
      assinatura: "documento para assinar",
      formulario: "formulário",
      other: "documento",
    },
  },
  en: {
    category_assinatura: "Signature request",
    category_formulario: "Form to complete",
    category_other: "Document to read",
    expiry_prefix: "Deadline:",
    classroom: "Class:",
    student: "Student:",
    body_intro: {
      assinatura: "Please open the link below to view the document and sign digitally.",
      formulario: "Please open the link below to view the document and complete the form.",
      other: "Please open the link below to view the document and confirm you have read it.",
    },
    cta: {
      assinatura: "✍️ Sign document",
      formulario: "📋 Complete form",
      other: "📄 Confirm reading",
    },
    footer_hint: "Opens the Edukamba app if installed, otherwise your browser.",
    footer_auto:
      "This email was sent automatically by Edukamba.<br />Please do not reply directly to this message.",
    subject_suffix: {
      assinatura: "document to sign",
      formulario: "form",
      other: "document",
    },
  },
  fr: {
    category_assinatura: "Demande de signature",
    category_formulario: "Formulaire à remplir",
    category_other: "Document à lire",
    expiry_prefix: "Date limite :",
    classroom: "Classe :",
    student: "Élève :",
    body_intro: {
      assinatura: "Veuillez ouvrir le lien ci-dessous pour consulter le document et le signer numériquement.",
      formulario: "Veuillez ouvrir le lien ci-dessous pour consulter le document et remplir le formulaire.",
      other: "Veuillez ouvrir le lien ci-dessous pour consulter le document et confirmer la lecture.",
    },
    cta: {
      assinatura: "✍️ Signer le document",
      formulario: "📋 Remplir le formulaire",
      other: "📄 Confirmer la lecture",
    },
    footer_hint: "Ouvre l’application Edukamba si elle est installée, sinon le navigateur.",
    footer_auto:
      "Cet e-mail a été envoyé automatiquement par Edukamba.<br />Merci de ne pas répondre directement à ce message.",
    subject_suffix: {
      assinatura: "document à signer",
      formulario: "formulaire",
      other: "document",
    },
  },
};

export function buildDocumentSignHtml(opts: {
  locale: UserLocale;
  recipientName: string;
  schoolName: string;
  documentTitle: string;
  documentCategory: string;
  classroomName: string | null;
  studentName: string | null;
  signUrl: string;
  expiresAt: string | null;
}): string {
  const L = COPY[opts.locale];
  const cat =
    opts.documentCategory === "assinatura"
      ? ("assinatura" as const)
      : opts.documentCategory === "formulario"
        ? ("formulario" as const)
        : ("other" as const);

  const categoryLabel =
    cat === "assinatura"
      ? L.category_assinatura
      : cat === "formulario"
        ? L.category_formulario
        : L.category_other;

  const headerColor =
    opts.documentCategory === "assinatura"
      ? "#3b82f6"
      : opts.documentCategory === "formulario"
        ? "#f59e0b"
        : "#22c55e";

  const headerIcon =
    opts.documentCategory === "assinatura" ? "✍️" : opts.documentCategory === "formulario" ? "📋" : "📄";

  const expiryLine = opts.expiresAt
    ? `<p style="margin:8px 0 0;font-size:13px;color:#dc2626;font-weight:600;">⚠️ ${L.expiry_prefix} ${localeDate(opts.expiresAt, opts.locale)}</p>`
    : "";

  const classroomLine = opts.classroomName
    ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;">${L.classroom} <strong>${opts.classroomName}</strong></p>`
    : "";

  const studentLine = opts.studentName
    ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;">${L.student} <strong>${opts.studentName}</strong></p>`
    : "";

  const firstName = opts.recipientName.split(" ")[0] || opts.recipientName;

  return `<!DOCTYPE html>
<html lang="${localeTag(opts.locale)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${categoryLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 10px 40px rgba(15,23,42,.08);">
        <tr>
          <td style="padding:28px 32px 12px;text-align:center;background:${headerColor};color:#ffffff;">
            <div style="font-size:42px;line-height:1;margin-bottom:8px;">${headerIcon}</div>
            <p style="margin:0;font-size:13px;opacity:.95;letter-spacing:.06em;text-transform:uppercase;">
              ${opts.schoolName}
            </p>
            <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;line-height:1.25;">
              ${categoryLabel}
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 12px;font-size:15px;color:#111827;line-height:1.6;">
              ${opts.locale === "pt" ? "Olá" : opts.locale === "fr" ? "Bonjour" : "Hello"} <strong>${firstName}</strong>,
            </p>
            <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.6;">
              <strong>${opts.documentTitle}</strong>
            </p>
            ${classroomLine}
            ${studentLine}
            <div style="margin:16px 0 12px;padding:14px 16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              ${expiryLine}
            </div>
            <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
              ${L.body_intro[cat]}
            </p>
            <div style="text-align:center;">
              <a href="${opts.signUrl}"
                 style="display:inline-block;background:${headerColor};color:#ffffff;text-decoration:none;
                        font-weight:700;font-size:15px;padding:14px 32px;border-radius:24px;letter-spacing:0.3px;">
                ${L.cta[cat]}
              </a>
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
              ${L.footer_hint}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              ${L.footer_auto}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function documentSignSubject(opts: {
  locale: UserLocale;
  schoolName: string;
  documentTitle: string;
  documentCategory: string;
}): string {
  const L = COPY[opts.locale];
  const cat =
    opts.documentCategory === "assinatura"
      ? ("assinatura" as const)
      : opts.documentCategory === "formulario"
        ? ("formulario" as const)
        : ("other" as const);
  const suffix = L.subject_suffix[cat];
  return `${opts.schoolName} — ${opts.documentTitle} (${suffix})`;
}
