const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function buildCredentialsHtml(opts: {
  recipientName: string;
  email: string;
  password: string;
  loginUrl: string;
  schoolName: string;
}): string {
  const { recipientName, email, password, loginUrl, schoolName } = opts;
  const firstName = recipientName.split(" ")[0] || recipientName;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Credenciais de acesso — Edukamba</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:#3b82f6;padding:28px 32px;text-align:center;">
            <div style="font-size:40px;line-height:1;">🔑</div>
            <p style="margin:8px 0 0;color:#ffffff;font-size:13px;font-weight:600;
                      text-transform:uppercase;letter-spacing:1px;opacity:0.9;">
              Credenciais de Acesso
            </p>
          </td>
        </tr>

        <!-- Branding -->
        <tr>
          <td style="padding:20px 32px 0;text-align:center;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:22px;font-weight:800;color:#1e293b;letter-spacing:-0.5px;">
              Edu<span style="color:#93c5fd;">kamba</span>
            </span>
            <p style="margin:4px 0 16px;font-size:12px;color:#94a3b8;">${schoolName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">Olá, <strong style="color:#1e293b;">${firstName}</strong></p>
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;line-height:1.3;">
              A sua conta foi criada na plataforma Edukamba
            </h1>
            <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
              Utilize as seguintes credenciais para aceder à plataforma:
            </p>

            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Email</p>
              <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#1e293b;">${email}</p>
              <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;border-top:1px solid #e5e7eb;padding-top:16px;">Password</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#1e293b;letter-spacing:3px;font-family:monospace;">${password}</p>
            </div>

            <div style="text-align:center;">
              <a href="${loginUrl}"
                 style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;
                        font-weight:700;font-size:15px;padding:14px 32px;border-radius:24px;letter-spacing:0.3px;">
                🔐 Entrar na plataforma
              </a>
            </div>
            <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
              Por segurança, recomendamos que altere a sua password após o primeiro acesso.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              Este email foi enviado automaticamente pelo sistema Edukamba.<br />
              Por favor não responda diretamente a esta mensagem.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendCredentialsEmail(opts: {
  recipientName: string;
  recipientEmail: string;
  password: string;
  loginUrl: string;
  schoolName: string;
  brevoKey: string;
  senderEmail: string;
  senderName: string;
}): Promise<void> {
  const { recipientName, recipientEmail, password, loginUrl, schoolName, brevoKey, senderEmail, senderName } = opts;

  const html = buildCredentialsHtml({
    recipientName,
    email: recipientEmail,
    password,
    loginUrl,
    schoolName,
  });

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoKey },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipientName }],
        subject: `${schoolName} — As suas credenciais de acesso à plataforma`,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`credentials-email: Brevo [${res.status}] to=${recipientEmail} — ${detail}`);
    } else {
      console.log(`credentials-email: enviado para ${recipientEmail}`);
    }
  } catch (e) {
    console.error("credentials-email: falha ao enviar", e);
  }
}
