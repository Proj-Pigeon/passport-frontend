/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_TURNSTILE_ACTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __PASSPORT_CONFIG__?: {
    apiBase?: string;
    turnstileSiteKey?: string;
    turnstileAction?: string;
  };
}
