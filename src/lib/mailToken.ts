export function tokenFromFragment(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw.length === 0) {
    return null;
  }
  const value = new URLSearchParams(raw).get('token');
  return value && value.length > 0 ? value : null;
}

export function tokenFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('token');
  return value && value.length > 0 ? value : null;
}

export function parseMailToken(search: string, hash: string): string | null {
  return tokenFromFragment(hash) ?? tokenFromSearch(search);
}

export function hasMailTokenInUrl(search: string, hash: string): boolean {
  return parseMailToken(search, hash) !== null;
}
