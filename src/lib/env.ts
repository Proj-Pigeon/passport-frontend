export interface AppEnv {
  apiBase: string;
  turnstileSiteKey: string | null;
}

interface RuntimeConfig {
  apiBase?: string;
  turnstileSiteKey?: string;
}

type RawEnv = Pick<ImportMetaEnv, 'VITE_API_BASE' | 'VITE_TURNSTILE_SITE_KEY'>;

function readRuntimeConfig(): RuntimeConfig | undefined {
  return typeof window === 'undefined' ? undefined : window.__PASSPORT_CONFIG__;
}

export function parseEnv(raw: RawEnv, runtime: RuntimeConfig = {}): AppEnv {
  const apiBase = (runtime.apiBase ?? raw.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');
  const turnstileSiteKey =
    (runtime.turnstileSiteKey ?? raw.VITE_TURNSTILE_SITE_KEY ?? '').trim() || null;
  return { apiBase, turnstileSiteKey };
}

export const env: AppEnv = parseEnv(import.meta.env, readRuntimeConfig());
