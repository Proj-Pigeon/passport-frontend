export interface AppEnv {
  apiBase: string;
  adminBase: string;
  accountBase: string;
  turnstileSiteKey: string | null;
  turnstileAction: string;
}

interface RuntimeConfig {
  apiBase?: string;
  adminBase?: string;
  accountBase?: string;
  turnstileSiteKey?: string;
  turnstileAction?: string;
}

type RawEnv = Pick<
  ImportMetaEnv,
  | 'VITE_API_BASE'
  | 'VITE_ADMIN_ORIGIN'
  | 'VITE_ACCOUNT_ORIGIN'
  | 'VITE_TURNSTILE_SITE_KEY'
  | 'VITE_TURNSTILE_ACTION'
>;

function readRuntimeConfig(): RuntimeConfig | undefined {
  return typeof window === 'undefined' ? undefined : window.__PASSPORT_CONFIG__;
}

function originValue(runtimeValue: string | undefined, rawValue: string | undefined): string {
  return (runtimeValue ?? rawValue ?? '').trim().replace(/\/+$/, '');
}

export function parseEnv(raw: RawEnv, runtime: RuntimeConfig = {}): AppEnv {
  const apiBase = (runtime.apiBase ?? raw.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');
  const adminBase = originValue(runtime.adminBase, raw.VITE_ADMIN_ORIGIN);
  const accountBase = originValue(runtime.accountBase, raw.VITE_ACCOUNT_ORIGIN);
  const turnstileSiteKey =
    (runtime.turnstileSiteKey ?? raw.VITE_TURNSTILE_SITE_KEY ?? '').trim() || null;
  const turnstileAction =
    (runtime.turnstileAction ?? raw.VITE_TURNSTILE_ACTION ?? '').trim() || 'auth';
  return { apiBase, adminBase, accountBase, turnstileSiteKey, turnstileAction };
}

export const env: AppEnv = parseEnv(import.meta.env, readRuntimeConfig());
