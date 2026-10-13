export interface AppEnv {
  apiBase: string;
  turnstileSiteKey: string | null;
}

type RawEnv = Pick<ImportMetaEnv, 'VITE_API_BASE' | 'VITE_TURNSTILE_SITE_KEY'>;

export function parseEnv(raw: RawEnv): AppEnv {
  const apiBase = (raw.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');
  const turnstileSiteKey = (raw.VITE_TURNSTILE_SITE_KEY ?? '').trim() || null;
  return { apiBase, turnstileSiteKey };
}

export const env: AppEnv = parseEnv(import.meta.env);
