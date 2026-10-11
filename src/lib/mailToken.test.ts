import { describe, expect, it } from 'vitest';

import { hasMailTokenInUrl, parseMailToken, tokenFromFragment, tokenFromSearch } from './mailToken';

const TOKEN = 'kz_PCPcA_6eyVr9nFTDr0cQpYxnQKEjZmbaeGsweZR4';

describe('tokenFromFragment', () => {
  it('reads a token from the fragment', () => {
    expect(tokenFromFragment(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromFragment(`token=${TOKEN}`)).toBe(TOKEN);
  });

  it('reads a token alongside other fragment params', () => {
    expect(tokenFromFragment(`#state=x&token=${TOKEN}&type=verify`)).toBe(TOKEN);
  });

  it('returns null for empty or token-less fragments', () => {
    expect(tokenFromFragment('')).toBeNull();
    expect(tokenFromFragment('#')).toBeNull();
    expect(tokenFromFragment('#access_token=abc')).toBeNull();
    expect(tokenFromFragment('#token=')).toBeNull();
  });
});

describe('tokenFromSearch', () => {
  it('reads a token from the query string', () => {
    expect(tokenFromSearch(`?token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromSearch(`?a=1&token=${TOKEN}`)).toBe(TOKEN);
  });

  it('returns null when absent', () => {
    expect(tokenFromSearch('')).toBeNull();
    expect(tokenFromSearch('?token=')).toBeNull();
  });
});

describe('parseMailToken', () => {
  it('prefers the fragment over the query string', () => {
    expect(parseMailToken('?token=from_query', `#token=${TOKEN}`)).toBe(TOKEN);
  });

  it('falls back to the query string', () => {
    expect(parseMailToken(`?token=${TOKEN}`, '')).toBe(TOKEN);
  });

  it('returns null when neither carries a token', () => {
    expect(parseMailToken('', '')).toBeNull();
    expect(parseMailToken('?other=1', '#hash')).toBeNull();
  });

  it('decodes percent-encoded tokens', () => {
    expect(parseMailToken(`?token=${encodeURIComponent(TOKEN)}`, '')).toBe(TOKEN);
  });
});

describe('hasMailTokenInUrl', () => {
  it('reflects parseMailToken', () => {
    expect(hasMailTokenInUrl(`?token=${TOKEN}`, '')).toBe(true);
    expect(hasMailTokenInUrl('', '')).toBe(false);
  });
});
