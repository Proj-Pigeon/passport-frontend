import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCsrfToken, resetCsrfToken } from './csrf';
import { ApiError } from './errors';
import { apiBlobOrNull, apiGet, apiRequest, apiVoid, resolveAssetUrl } from './http';
import { setUnauthorizedHandler, type UnauthorizedEvent } from './unauthorized';
import { mockDb, server } from '@/test/mocks/server';

const PATH = '/v1/probe';

function apiPostProbe() {
  return apiRequest<{ ok: boolean }>(PATH, { method: 'POST' });
}

afterEach(() => {
  setUnauthorizedHandler(null);
  resetCsrfToken();
});

describe('apiRequest reads', () => {
  it('parses a JSON payload', async () => {
    server.use(
      http.get(`*${PATH}`, () =>
        HttpResponse.json({ hello: 'world' }, { headers: { 'X-Request-ID': 'req_read' } }),
      ),
    );

    await expect(apiGet<{ hello: string }>(PATH)).resolves.toEqual({ hello: 'world' });
  });

  it('returns undefined for 204 responses', async () => {
    server.use(http.get(`*${PATH}`, () => new HttpResponse(null, { status: 204 })));
    await expect(apiGet<undefined>(PATH)).resolves.toBeUndefined();
  });

  it('returns undefined for empty 200 bodies', async () => {
    server.use(http.get(`*${PATH}`, () => new HttpResponse(null, { status: 200 })));
    await expect(apiGet<undefined>(PATH)).resolves.toBeUndefined();
  });

  it('throws on malformed JSON', async () => {
    server.use(
      http.get(`*${PATH}`, () =>
        HttpResponse.text('{not json', {
          headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_bad_json' },
        }),
      ),
    );

    await expect(apiGet(PATH)).rejects.toMatchObject({
      code: 'invalid_request',
      requestId: 'req_bad_json',
    });
  });
});

describe('apiRequest writes', () => {
  it('sends a JSON body and the CSRF header', async () => {
    let seen: { csrf: string | null; body: string; contentType: string | null } = {
      csrf: null,
      body: '',
      contentType: null,
    };

    server.use(
      http.post(`*${PATH}`, async ({ request }) => {
        seen = {
          csrf: request.headers.get('x-csrf-token'),
          body: await request.text(),
          contentType: request.headers.get('content-type'),
        };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await apiVoid(PATH, { method: 'POST', body: { a: 1 } });

    expect(seen.csrf).toBe(mockDb.csrfToken);
    expect(seen.body).toBe('{"a":1}');
    expect(seen.contentType).toBe('application/json');
  });

  it('configures the fetch init for cookie-authenticated, uncached requests', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith('/v1/auth/csrf')) {
        return new Response(JSON.stringify({ token: mockDb.csrfToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    await apiVoid(PATH, { method: 'POST' });

    const writeCall = fetchSpy.mock.calls.find(([input]) => String(input).endsWith(PATH));
    expect(writeCall?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });
    const headers = writeCall?.[1]?.headers as Headers;
    expect(headers.get('x-csrf-token')).toBe(mockDb.csrfToken);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('sends an empty JSON object when no body is supplied', async () => {
    let body = '';
    server.use(
      http.post(`*${PATH}`, async ({ request }) => {
        body = await request.text();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await apiRequest(PATH, { method: 'POST' });
    expect(body).toBe('{}');
  });

  it('omits the CSRF header when skipped', async () => {
    let csrf: string | null = 'unset';
    server.use(
      http.post(`*${PATH}`, ({ request }) => {
        csrf = request.headers.get('x-csrf-token');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await apiRequest(PATH, { method: 'POST', skipCsrf: true });
    expect(csrf).toBeNull();
  });
});

describe('apiRequest CSRF retry', () => {
  it('refreshes the token and retries once after a 403', async () => {
    let tokenCalls = 0;
    let writeCalls = 0;

    server.use(
      http.get('*/v1/auth/csrf', () => {
        tokenCalls += 1;
        return HttpResponse.json({ token: tokenCalls === 1 ? 'stale' : mockDb.csrfToken });
      }),
      http.post(`*${PATH}`, ({ request }) => {
        writeCalls += 1;
        if (request.headers.get('x-csrf-token') !== mockDb.csrfToken) {
          return HttpResponse.json(
            { error: { code: 'forbidden', message: 'bad csrf' } },
            { status: 403 },
          );
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(apiPostProbe()).resolves.toEqual({ ok: true });
    expect(tokenCalls).toBe(2);
    expect(writeCalls).toBe(2);
    expect(await getCsrfToken()).toBe(mockDb.csrfToken);
  });

  it('propagates a second 403 without retrying again', async () => {
    let writeCalls = 0;
    server.use(
      http.post(`*${PATH}`, () => {
        writeCalls += 1;
        return HttpResponse.json(
          { error: { code: 'forbidden', message: 'nope' } },
          { status: 403 },
        );
      }),
    );

    await expect(apiPostProbe()).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    expect(writeCalls).toBe(2);
  });

  it('preserves login_required without a CSRF retry or unauthorized event', async () => {
    let calls = 0;
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const loginUrl = 'https://account.example/login?reauth=required&next=%2Fauthorize';
    server.use(
      http.post(`*${PATH}`, () => {
        calls++;
        return HttpResponse.json(
          { error: { code: 'login_required' }, login_url: loginUrl },
          { status: 403 },
        );
      }),
    );
    try {
      await expect(apiPostProbe()).rejects.toMatchObject({
        status: 403,
        code: 'login_required',
        loginUrl,
      });
      expect(calls).toBe(1);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      setUnauthorizedHandler(null);
    }
  });

  it('does not retry 403s for read requests', async () => {
    let calls = 0;
    server.use(
      http.get(`*${PATH}`, () => {
        calls += 1;
        return HttpResponse.json(
          { error: { code: 'forbidden', message: 'nope' } },
          { status: 403 },
        );
      }),
    );

    await expect(apiGet(PATH)).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
  });
});

describe('apiRequest errors', () => {
  it('surfaces field errors and the request id', async () => {
    server.use(
      http.post(`*${PATH}`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              message: 'The request is not valid.',
              request_id: 'req_fields',
              fields: [{ name: 'password', code: 'invalid_format' }],
            },
          },
          { status: 422, headers: { 'X-Request-ID': 'req_fields' } },
        ),
      ),
    );

    const error = await apiRequest(PATH, { method: 'POST' }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'validation_failed' });
    expect((error as ApiError).fieldCode('password')).toBe('invalid_format');
  });

  it('reads Retry-After from a 429', async () => {
    server.use(
      http.post(`*${PATH}`, () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      ),
    );

    await expect(apiRequest(PATH, { method: 'POST' })).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 60,
    });
  });

  it('maps a network failure to network_error', async () => {
    server.use(http.get(`*${PATH}`, () => HttpResponse.error()));
    await expect(apiGet(PATH)).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('maps an aborted request to aborted', async () => {
    server.use(
      http.get(`*${PATH}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({});
      }),
    );

    const controller = new AbortController();
    controller.abort();
    await expect(apiGet(PATH, { signal: controller.signal })).rejects.toMatchObject({
      code: 'aborted',
    });
  });
});

describe('global 401 handling', () => {
  it('emits an unauthorized event', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    server.use(http.get(`*${PATH}`, () => HttpResponse.json({}, { status: 401 })));

    await expect(apiGet(PATH)).rejects.toMatchObject({ status: 401 });

    const event: UnauthorizedEvent = handler.mock.calls[0]?.[0] as UnauthorizedEvent;
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.path).toBe(PATH);
    expect(event.method).toBe('GET');
  });

  it('stays quiet when suppressed', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    server.use(http.get(`*${PATH}`, () => HttpResponse.json({}, { status: 401 })));

    await expect(apiGet(PATH, { suppressUnauthorized: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('apiBlobOrNull', () => {
  it('returns null on 404', async () => {
    server.use(http.get(`*${PATH}`, () => HttpResponse.json({}, { status: 404 })));
    await expect(apiBlobOrNull(PATH)).resolves.toBeNull();
  });

  it('returns the blob and content type', async () => {
    server.use(
      http.get(
        `*${PATH}`,
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'Content-Type': 'image/png', ETag: '"abc"' },
          }),
      ),
    );

    const result = await apiBlobOrNull(PATH);
    expect(result?.contentType).toBe('image/png');
    expect(result?.etag).toBe('"abc"');
    expect(result?.blob.size).toBe(3);
  });
});

describe('resolveAssetUrl', () => {
  it('prefixes relative paths with the API base', () => {
    expect(resolveAssetUrl('/v1/me/avatar')).toBe('/v1/me/avatar');
    expect(resolveAssetUrl('v1/me/avatar')).toBe('/v1/me/avatar');
  });

  it('passes through absolute URLs and empty values', () => {
    expect(resolveAssetUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png');
    expect(resolveAssetUrl('')).toBeNull();
    expect(resolveAssetUrl(null)).toBeNull();
    expect(resolveAssetUrl(undefined)).toBeNull();
  });
});
