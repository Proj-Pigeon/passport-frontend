/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_ADMIN_ORIGIN?: string;
  readonly VITE_ACCOUNT_ORIGIN?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_TURNSTILE_ACTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __PASSPORT_CONFIG__?: {
    apiBase?: string;
    adminBase?: string;
    accountBase?: string;
    turnstileSiteKey?: string;
    turnstileAction?: string;
  };
}
