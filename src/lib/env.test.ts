import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to same-origin without turnstile', () => {
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

  it('prefers runtime configuration over build-time values', () => {
    expect(
      parseEnv(
        {
          VITE_API_BASE: 'https://build.example',
          VITE_TURNSTILE_SITE_KEY: '0xBUILD',
        },
        {
          apiBase: ' https://runtime.example/ ',
          turnstileSiteKey: ' 0x4RUNTIME ',
        },
      ),
    ).toEqual({
      apiBase: 'https://runtime.example',
      turnstileSiteKey: '0x4RUNTIME',
    });
  });

  it('lets runtime configuration clear build-time values', () => {
    expect(
      parseEnv(
        {
          VITE_API_BASE: 'https://build.example',
          VITE_TURNSTILE_SITE_KEY: '0xBUILD',
        },
        { apiBase: '', turnstileSiteKey: '' },
      ),
    ).toEqual({
      apiBase: '',
      turnstileSiteKey: null,
    });
  });
});
