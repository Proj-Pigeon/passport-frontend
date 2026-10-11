import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to same-origin, no turnstile, no providers', () => {
    expect(parseEnv({})).toEqual({
      apiBase: '',
      turnstileSiteKey: null,
      federationProviders: [],
    });
  });

  it('normalizes values', () => {
    expect(
      parseEnv({
        VITE_API_BASE: ' https://account.example/ ',
        VITE_TURNSTILE_SITE_KEY: ' 0x4AAA ',
        VITE_FEDERATION_PROVIDERS: 'Google, github,,google ',
      }),
    ).toEqual({
      apiBase: 'https://account.example',
      turnstileSiteKey: '0x4AAA',
      federationProviders: ['google', 'github'],
    });
  });
});
