export const NEXT_ALLOW_LIST = ['/account', '/authorize', '/admin', '/device'] as const;

const MAX_NEXT_LENGTH = 2048;

export function safeNext(candidate: unknown, origin?: string): string | null {
  if (typeof candidate !== 'string') {
    return null;
  }
  const value = candidate.trim();
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) {
    return null;
  }

  const base = origin ?? window.location.origin;
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }

  if (url.origin !== base) {
    return null;
  }

  const allowed = NEXT_ALLOW_LIST.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  if (!allowed) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function nextFromSearchParams(search: string, origin?: string): string | null {
  const params = new URLSearchParams(search);
  return safeNext(params.get('next'), origin);
}

export function withNextParam(path: string, next: string): string {
  const url = new URL(path, 'http://local.invalid');
  url.searchParams.set('next', next);
  return `${url.pathname}${url.search}`;
}

export interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

export function locationToNext(location: LocationLike, origin?: string): string | null {
  return safeNext(`${location.pathname}${location.search}${location.hash}`, origin);
}
