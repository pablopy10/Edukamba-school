/**
 * Banner "Abrir na app" — aparece no topo do web app em browsers móveis
 * (iOS Safari, Chrome Android, etc.) mas NÃO dentro da app Capacitor.
 *
 * Quando o utilizador clica num link de email e chega ao browser, este banner
 * aparece imediatamente e tenta abrir a app Edukamba via custom URL scheme.
 */
import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "edukamba";
const DISMISSED_KEY = "edukamba_app_banner_dismissed";

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildAppUrl(pathname: string): string {
  const clean = pathname.replace(/^\//, "") || "dashboard";
  return `${APP_SCHEME}://${clean}`;
}

export function OpenInAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Não mostrar dentro da app Capacitor
    if (Capacitor.isNativePlatform()) return;
    // Só mostrar em browsers móveis
    if (!isMobileBrowser()) return;
    // Não mostrar se já foi descartado nesta sessão
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    setVisible(true);

    // Tentar abrir a app automaticamente (sem interação do utilizador)
    // Funciona se a app estiver instalada e o scheme registado
    const appUrl = buildAppUrl(window.location.pathname);
    const tryOpen = setTimeout(() => {
      try { window.location.href = appUrl; } catch { /* ignore */ }
    }, 300);

    return () => clearTimeout(tryOpen);
  }, []);

  if (!visible) return null;

  const handleOpen = () => {
    const appUrl = buildAppUrl(window.location.pathname);
    window.location.href = appUrl;
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#1e293b",
        color: "#fff",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
      }}
    >
      {/* Logo */}
      <span style={{ fontSize: "24px", flexShrink: 0 }}>🎓</span>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#f8fafc" }}>
          Edu<span style={{ color: "#f59e0b" }}>kamba</span>
        </p>
        <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8", lineHeight: 1.3 }}>
          Abrir na aplicação móvel
        </p>
      </div>

      {/* Botão abrir */}
      <button
        onClick={handleOpen}
        style={{
          background: "#f59e0b",
          color: "#fff",
          border: "none",
          borderRadius: "20px",
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        Abrir
      </button>

      {/* Fechar */}
      <button
        onClick={handleDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "#94a3b8",
          cursor: "pointer",
          fontSize: "18px",
          lineHeight: 1,
          padding: "4px",
          flexShrink: 0,
        }}
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
