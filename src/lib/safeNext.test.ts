import { describe, expect, it } from 'vitest';

import { locationToNext, nextFromSearchParams, safeNext, withNextParam } from './safeNext';

const ORIGIN = 'http://localhost:5173';

describe('safeNext', () => {
  it('accepts allow-listed relative paths', () => {
    expect(safeNext('/account', ORIGIN)).toBe('/account');
    expect(safeNext('/account/security', ORIGIN)).toBe('/account/security');
    expect(safeNext('/authorize?interaction=int_1', ORIGIN)).toBe('/authorize?interaction=int_1');
  });

  it('preserves hash on allow-listed paths', () => {
    expect(safeNext('/account#top', ORIGIN)).toBe('/account#top');
  });

  it('accepts same-origin absolute URLs and strips the origin', () => {
    expect(safeNext(`${ORIGIN}/account/profile`, ORIGIN)).toBe('/account/profile');
  });

  it.each([
    ['//evil.example/account'],
    ['/\\evil.example/account'],
    ['https://evil.example/account'],
    ['http://localhost:5173.evil.example/account'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>'],
  ])('rejects the off-site candidate %s', (candidate) => {
    expect(safeNext(candidate, ORIGIN)).toBeNull();
  });

  it.each([['/'], ['/login'], ['/register'], ['/accountant'], ['/verify-email']])(
    'rejects paths outside the allow list: %s',
    (candidate) => {
      expect(safeNext(candidate, ORIGIN)).toBeNull();
    },
  );

  it('rejects non-strings and oversized values', () => {
    expect(safeNext(undefined, ORIGIN)).toBeNull();
    expect(safeNext(42, ORIGIN)).toBeNull();
    expect(safeNext('', ORIGIN)).toBeNull();
    expect(safeNext(`/account?x=${'a'.repeat(4096)}`, ORIGIN)).toBeNull();
  });
});

describe('nextFromSearchParams', () => {
  it('reads and validates the next parameter', () => {
    expect(nextFromSearchParams('?next=%2Faccount', ORIGIN)).toBe('/account');
    expect(nextFromSearchParams('?next=%2F%2Fevil.example', ORIGIN)).toBeNull();
    expect(nextFromSearchParams('', ORIGIN)).toBeNull();
  });
});

describe('withNextParam', () => {
  it('appends an encoded next parameter', () => {
    expect(withNextParam('/login', '/account/security')).toBe('/login?next=%2Faccount%2Fsecurity');
  });

  it('keeps existing query parameters', () => {
    expect(withNextParam('/authorize?a=1', '/account')).toBe('/authorize?a=1&next=%2Faccount');
  });
});

describe('locationToNext', () => {
  it('serializes a location and validates it', () => {
    expect(locationToNext({ pathname: '/account/profile', search: '?x=1', hash: '' }, ORIGIN)).toBe(
      '/account/profile?x=1',
    );
    expect(locationToNext({ pathname: '/login', search: '', hash: '' }, ORIGIN)).toBeNull();
  });
});
