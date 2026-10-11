import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from './errors';
import { getCsrfToken, peekCsrfToken, resetCsrfToken } from './csrf';
import { mockDb, server } from '@/test/mocks/server';

beforeEach(() => {
  resetCsrfToken();
});

describe('getCsrfToken', () => {
  it('fetches and caches the token', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/auth/csrf', () => {
        calls += 1;
        return HttpResponse.json({ token: 'fresh-token' });
      }),
    );

    expect(peekCsrfToken()).toBeNull();
    expect(await getCsrfToken()).toBe('fresh-token');
    expect(peekCsrfToken()).toBe('fresh-token');
    expect(await getCsrfToken()).toBe('fresh-token');
    expect(calls).toBe(1);
  });

  it('deduplicates concurrent requests', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/auth/csrf', async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return HttpResponse.json({ token: 'shared-token' });
      }),
    );

    const results = await Promise.all([getCsrfToken(), getCsrfToken(), getCsrfToken()]);
    expect(results).toEqual(['shared-token', 'shared-token', 'shared-token']);
    expect(calls).toBe(1);
  });

  it('refetches after a reset', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/auth/csrf', () => {
        calls += 1;
        return HttpResponse.json({ token: `token-${calls}` });
      }),
    );

    expect(await getCsrfToken()).toBe('token-1');
    resetCsrfToken();
    expect(await getCsrfToken()).toBe('token-2');
    expect(calls).toBe(2);
  });

  it('does not cache a failed request', async () => {
    server.use(http.get('*/v1/auth/csrf', () => HttpResponse.json({}, { status: 503 })));

    await expect(getCsrfToken()).rejects.toMatchObject({ status: 503 });
    expect(peekCsrfToken()).toBeNull();
  });

  it('rejects a malformed token payload', async () => {
    server.use(http.get('*/v1/auth/csrf', () => HttpResponse.json({ token: '' })));

    await expect(getCsrfToken()).rejects.toBeInstanceOf(ApiError);
  });

  it('reads the token the mock backend expects', async () => {
    expect(await getCsrfToken()).toBe(mockDb.csrfToken);
  });
});
