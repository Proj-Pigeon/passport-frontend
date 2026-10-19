import { describe, expect, it } from 'vitest';

import { federationStartUrl } from './federation';

describe('federationStartUrl', () => {
  it('keeps normal federation start URLs unchanged', () => {
    expect(federationStartUrl('github')).toBe('/federation/github/start');
    const url = new URL(
      federationStartUrl('example', { terms: 1, privacy: 1 }),
      window.location.origin,
    );
    expect([...url.searchParams.keys()]).toEqual(['compliance_versions']);
  });

  it('carries the safe reauthentication return and current consent versions', () => {
    const url = new URL(
      federationStartUrl(
        'oidc',
        { terms: 2, privacy: 2, cross_border: 2 },
        {
          next: '/authorize?interaction=int_1',
        },
      ),
      window.location.origin,
    );
    expect(url.searchParams.get('reauth')).toBe('required');
    expect(url.searchParams.get('next')).toBe('/authorize?interaction=int_1');
    expect(JSON.parse(url.searchParams.get('compliance_versions')!)).toEqual({
      terms: 2,
      privacy: 2,
      cross_border: 2,
    });
  });

  it.each([
    'https://evil.test/authorize',
    '//evil.test/account',
    'javascript:alert(1)',
    '/login',
    null,
  ])('omits an unsafe next: %s', (next) => {
    const url = new URL(federationStartUrl('oidc', {}, { next }), window.location.origin);
    expect(url.searchParams.get('reauth')).toBe('required');
    expect(url.searchParams.has('next')).toBe(false);
  });
});
