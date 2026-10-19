import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to same-origin without turnstile', () => {
    expect(parseEnv({})).toEqual({
      apiBase: '',
      adminBase: '',
      accountBase: '',
      turnstileSiteKey: null,
      turnstileAction: 'auth',
    });
  });

  it('normalizes values', () => {
    expect(
      parseEnv({
        VITE_API_BASE: ' https://api.example/ ',
        VITE_ADMIN_ORIGIN: ' https://admin.example/ ',
        VITE_ACCOUNT_ORIGIN: ' https://account.example/ ',
        VITE_TURNSTILE_SITE_KEY: ' 0x4AAA ',
      }),
    ).toEqual({
      apiBase: 'https://api.example',
      adminBase: 'https://admin.example',
      accountBase: 'https://account.example',
      turnstileSiteKey: '0x4AAA',
      turnstileAction: 'auth',
    });
  });

  it('prefers runtime configuration over build-time values', () => {
    expect(
      parseEnv(
        {
          VITE_API_BASE: 'https://build.example',
          VITE_ADMIN_ORIGIN: 'https://admin.build.example',
          VITE_ACCOUNT_ORIGIN: 'https://account.build.example',
          VITE_TURNSTILE_SITE_KEY: '0xBUILD',
          VITE_TURNSTILE_ACTION: 'build-action',
        },
        {
          apiBase: ' https://runtime.example/ ',
          adminBase: ' https://admin.runtime.example/ ',
          accountBase: ' https://account.runtime.example/ ',
          turnstileSiteKey: ' 0x4RUNTIME ',
          turnstileAction: ' runtime-action ',
        },
      ),
    ).toEqual({
      apiBase: 'https://runtime.example',
      adminBase: 'https://admin.runtime.example',
      accountBase: 'https://account.runtime.example',
      turnstileSiteKey: '0x4RUNTIME',
      turnstileAction: 'runtime-action',
    });
  });

  it('lets runtime configuration clear build-time values', () => {
    expect(
      parseEnv(
        {
          VITE_API_BASE: 'https://build.example',
          VITE_ADMIN_ORIGIN: 'https://admin.build.example',
          VITE_ACCOUNT_ORIGIN: 'https://account.build.example',
          VITE_TURNSTILE_SITE_KEY: '0xBUILD',
        },
        {
          apiBase: '',
          adminBase: '',
          accountBase: '',
          turnstileSiteKey: '',
          turnstileAction: '',
        },
      ),
    ).toEqual({
      apiBase: '',
      adminBase: '',
      accountBase: '',
      turnstileSiteKey: null,
      turnstileAction: 'auth',
    });
  });
});
