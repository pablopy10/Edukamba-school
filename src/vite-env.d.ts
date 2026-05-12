/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ONESIGNAL_APP_ID?: string;
  readonly VITE_ONESIGNAL_SAFARI_WEB_ID?: string;
  /** NIF da entidade produtora do software (SAF-T AO Header `ProductCompanyTaxID`), se ≠ NIF da escola emitente */
  readonly VITE_SAFT_PRODUCT_COMPANY_TAX_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
