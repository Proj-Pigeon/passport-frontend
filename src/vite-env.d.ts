/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_FEDERATION_PROVIDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
