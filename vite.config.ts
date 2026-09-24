import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const hasSentryUpload = Boolean(env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT);

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    hasSentryUpload &&
      sentryVitePlugin({
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        authToken: env.SENTRY_AUTH_TOKEN,
        telemetry: false,
        ...(env.VITE_SENTRY_RELEASE ? { release: { name: env.VITE_SENTRY_RELEASE } } : {}),
        sourcemaps: {
          assets: "./dist/**",
          ...(env.SENTRY_DELETE_SOURCEMAPS === "1" ? { filesToDeleteAfterUpload: "./dist/**/*.map" } : {}),
        },
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    /** Source maps enviados pelo plugin Sentry em CI (com SENTRY_AUTH_TOKEN). */
    sourcemap: hasSentryUpload ? "hidden" : false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-sentry": ["@sentry/react"],
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query", "@tanstack/react-query-persist-client", "@tanstack/query-sync-storage-persister"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": ["lucide-react", "@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-tooltip", "@radix-ui/react-popover", "@radix-ui/react-dropdown-menu"],
          "vendor-charts": ["recharts"],
          "vendor-date": ["date-fns"],
        },
      },
    },
  },
};
});
