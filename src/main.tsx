import "@/lib/sentry/sentry.client.config";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { EdukambaErrorBoundary } from "@/components/EdukambaErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <EdukambaErrorBoundary>
    <App />
  </EdukambaErrorBoundary>,
);
