/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ONESIGNAL_APP_ID?: string;
  readonly VITE_ONESIGNAL_SAFARI_WEB_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
