import "@/lib/sentry/sentry.client.config";
import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { EdukambaErrorBoundary } from "@/components/EdukambaErrorBoundary";
import "./index.css";

/** iOS/Android WebView: activa tokens CSS de safe area mínima 28px em `index.css`. */
if (typeof document !== "undefined" && Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("capacitor-native");
}

createRoot(document.getElementById("root")!).render(
  <EdukambaErrorBoundary>
    <App />
  </EdukambaErrorBoundary>,
);
