import { isApiError } from '@/api/errors';

import { env } from './env';
import { safeNext, withNextParam } from './safeNext';

export function isOAuthReauthentication(error: unknown): boolean {
  return isApiError(error) && error.status === 403 && error.code === 'login_required';
}

export function oauthReauthenticationUrl(error: unknown, interactionId: string): string | null {
  if (!isOAuthReauthentication(error)) return null;

  const next = `/authorize?interaction=${encodeURIComponent(interactionId)}`;
  const fallback = `${withNextParam('/login', next)}&reauth=required`;
  if (!isApiError(error) || !error.loginUrl) return fallback;

  try {
    const url = new URL(error.loginUrl);
    const accountOrigin = new URL(env.accountBase || window.location.origin).origin;
    if (
      url.origin !== accountOrigin ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/login' ||
      url.hash ||
      url.searchParams.get('reauth') !== 'required' ||
      safeNext(url.searchParams.get('next'), accountOrigin) !== next
    ) {
      return fallback;
    }
    return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.href;
  } catch {
    return fallback;
  }
}
