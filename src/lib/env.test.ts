import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to same-origin, no turnstile, no providers configuration', () => {
    expect(parseEnv({})).toEqual({
      apiBase: '',
      turnstileSiteKey: null,
    });
  });

  it('normalizes values', () => {
    expect(
      parseEnv({
        VITE_API_BASE: ' https://account.example/ ',
        VITE_TURNSTILE_SITE_KEY: ' 0x4AAA ',
      }),
    ).toEqual({
      apiBase: 'https://account.example',
      turnstileSiteKey: '0x4AAA',
    });
  });
});
