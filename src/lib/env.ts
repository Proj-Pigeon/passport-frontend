export interface AppEnv {
  apiBase: string;
  turnstileSiteKey: string | null;
  turnstileAction: string;
}

interface RuntimeConfig {
  apiBase?: string;
  turnstileSiteKey?: string;
  turnstileAction?: string;
}

type RawEnv = Pick<
  ImportMetaEnv,
  'VITE_API_BASE' | 'VITE_TURNSTILE_SITE_KEY' | 'VITE_TURNSTILE_ACTION'
>;

function readRuntimeConfig(): RuntimeConfig | undefined {
  return typeof window === 'undefined' ? undefined : window.__PASSPORT_CONFIG__;
}

export function parseEnv(raw: RawEnv, runtime: RuntimeConfig = {}): AppEnv {
  const apiBase = (runtime.apiBase ?? raw.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');
  const turnstileSiteKey =
    (runtime.turnstileSiteKey ?? raw.VITE_TURNSTILE_SITE_KEY ?? '').trim() || null;
  const turnstileAction =
    (runtime.turnstileAction ?? raw.VITE_TURNSTILE_ACTION ?? '').trim() || 'auth';
  return { apiBase, turnstileSiteKey, turnstileAction };
}

export const env: AppEnv = parseEnv(import.meta.env, readRuntimeConfig());
