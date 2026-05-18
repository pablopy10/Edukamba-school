/**
 * Página de redirect inteligente: tenta abrir a app nativa (iOS/Android)
 * via custom URL scheme. Se a app não estiver instalada, redireciona para a web.
 *
 * Usado em todos os links de email: https://www.edukamba.com/app-open?path=/pagamentos
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const APP_SCHEME = "edukamba";
const WEB_BASE = "https://www.edukamba.com";
/** Tempo a aguardar antes de concluir que a app não está instalada (ms). */
const FALLBACK_DELAY = 1800;

function getParams(): { path: string; webUrl: string; appUrl: string } {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") ?? "/dashboard";
  const webUrl = params.get("web") ?? `${WEB_BASE}${path}`;
  const cleanPath = path.replace(/^\//, "");
  const appUrl = `${APP_SCHEME}://${cleanPath}`;
  return { path, webUrl, appUrl };
}

export default function AppOpen() {
  const { t } = useTranslation("pages");
  const [status, setStatus] = useState<"trying" | "redirecting">("trying");
  const didRedirect = useRef(false);

  useEffect(() => {
    const { appUrl, webUrl } = getParams();

    // Tentar abrir a app via custom scheme
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = appUrl;
    document.body.appendChild(iframe);

    // Também tentar via window.location (funciona melhor em alguns browsers)
    try {
      window.location.href = appUrl;
    } catch {
      // Ignorar erros de scheme não suportado
    }

    // Fallback: se a app não abrir em FALLBACK_DELAY ms, ir para a web
    const timer = setTimeout(() => {
      if (didRedirect.current) return;
      didRedirect.current = true;
      setStatus("redirecting");
      document.body.removeChild(iframe);
      window.location.replace(webUrl);
    }, FALLBACK_DELAY);

    // Se a página ficar oculta (a app abriu), cancelar o fallback
    const handleVisibilityChange = () => {
      if (document.hidden) {
        didRedirect.current = true;
        clearTimeout(timer);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    };
  }, []);

  const { webUrl } = getParams();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#f1f5f9",
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          padding: "40px 32px",
          maxWidth: "360px",
          width: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎓</div>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: "22px",
            fontWeight: "800",
            color: "#1e293b",
          }}
        >
          Edu<span style={{ color: "#f59e0b" }}>kamba</span>
        </h1>

        {status === "trying" ? (
          <>
            <p style={{ margin: "16px 0 24px", fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>
              {t("app_open.opening_app")}
            </p>
            {/* Spinner */}
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "3px solid #e2e8f0",
                borderTopColor: "#f59e0b",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 24px",
              }}
            />
          </>
        ) : (
          <p style={{ margin: "16px 0 24px", fontSize: "14px", color: "#64748b", lineHeight: 1.6 }}>
            {t("app_open.redirecting_web")}
          </p>
        )}

        <a
          href={webUrl}
          style={{
            display: "inline-block",
            background: "#f59e0b",
            color: "#fff",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "14px",
            padding: "12px 28px",
            borderRadius: "24px",
          }}
        >
          {t("app_open.open_in_web")}
        </a>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
