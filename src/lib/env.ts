export interface AppEnv {
  apiBase: string;
  turnstileSiteKey: string | null;
  federationProviders: string[];
}

type RawEnv = Pick<
  ImportMetaEnv,
  'VITE_API_BASE' | 'VITE_TURNSTILE_SITE_KEY' | 'VITE_FEDERATION_PROVIDERS'
>;

export function parseEnv(raw: RawEnv): AppEnv {
  const apiBase = (raw.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');
  const turnstileSiteKey = (raw.VITE_TURNSTILE_SITE_KEY ?? '').trim() || null;
  const federationProviders = (raw.VITE_FEDERATION_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i);

  return { apiBase, turnstileSiteKey, federationProviders };
}

export const env: AppEnv = parseEnv(import.meta.env);
