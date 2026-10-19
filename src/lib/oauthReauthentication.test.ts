import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/errors';

import { env } from './env';
import { oauthReauthenticationUrl } from './oauthReauthentication';

function reauth(loginUrl?: string) {
  return new ApiError({
    status: 403,
    code: 'login_required',
    message: 'Authenticate again.',
    loginUrl,
  });
}

describe('oauthReauthenticationUrl', () => {
  const fallback = '/login?next=%2Fauthorize%3Finteraction%3Dint_1&reauth=required';

  it('uses a same-origin login URL while preserving the interaction', () => {
    expect(oauthReauthenticationUrl(reauth(`${window.location.origin}${fallback}`), 'int_1')).toBe(
      fallback,
    );
  });

  it('allows only the configured account origin for cross-origin login', () => {
    const previous = env.accountBase;
    try {
      env.accountBase = 'https://account.example.test';
      expect(
        oauthReauthenticationUrl(reauth(`https://account.example.test${fallback}`), 'int_1'),
      ).toBe(`https://account.example.test${fallback}`);
      expect(oauthReauthenticationUrl(reauth(`https://evil.test${fallback}`), 'int_1')).toBe(
        fallback,
      );
    } finally {
      env.accountBase = previous;
    }
  });

  it.each([
    undefined,
    'javascript:alert(1)',
    '//evil.test/login',
    'https://evil.test/login?reauth=required&next=/authorize?interaction=int_1',
    `${window.location.origin}/account?reauth=required&next=/authorize?interaction=int_1`,
    `${window.location.origin}/login?reauth=required&next=https://evil.test/account`,
    `${window.location.origin}/login?reauth=required&next=/authorize?interaction=int_other`,
    `${window.location.origin}/login?next=/authorize?interaction=int_1`,
    `${window.location.origin}${fallback}#unexpected`,
  ])('falls back safely for an invalid or missing login_url: %s', (url) => {
    expect(oauthReauthenticationUrl(reauth(url), 'int_1')).toBe(fallback);
  });

  it('leaves ordinary forbidden and obsolete 401 responses alone', () => {
    for (const [status, code] of [
      [401, 'login_required'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
    ] as const) {
      expect(
        oauthReauthenticationUrl(
          new ApiError({ status, code, message: 'login_required' }),
          'int_1',
        ),
      ).toBeNull();
    }
  });
});
