import { env, type AppEnv } from '@/lib/env';

export function crossOriginViewURL(
  view: 'admin' | 'account',
  path: string,
  origins: Pick<AppEnv, 'adminBase' | 'accountBase'> = env,
): string | null {
  const base = view === 'admin' ? origins.adminBase : origins.accountBase;
  if (!base || window.location.origin === base) {
    return null;
  }
  return base + path;
}
