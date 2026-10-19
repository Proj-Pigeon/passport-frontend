import { describe, expect, it } from 'vitest';

import {
  ApiError,
  apiErrorFromResponse,
  errorI18nKey,
  fieldErrorI18nKey,
  isApiError,
  isUnauthorized,
  parseRetryAfter,
} from './errors';

function response(status: number, body: string, statusText = '', headers: HeadersInit = {}) {
  return new Response(body, { status, statusText, headers });
}

describe('parseRetryAfter', () => {
  it('reads delta seconds', () => {
    expect(parseRetryAfter('60')).toBe(60);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('returns null for missing or malformed values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('apiErrorFromResponse', () => {
  it('preserves the root login_url of the 403 OAuth reauthentication contract', () => {
    const loginUrl = 'https://account.example/login?reauth=required&next=%2Fauthorize';
    const body = JSON.stringify({ error: { code: 'login_required' }, login_url: loginUrl });
    const error = apiErrorFromResponse(response(403, body), body, null);
    expect(error).toMatchObject({ status: 403, code: 'login_required', loginUrl });
  });
  it('parses the unified envelope', () => {
    const body = JSON.stringify({
      error: {
        code: 'validation_failed',
        message: 'The request is not valid.',
        request_id: 'req_abc',
        fields: [{ name: 'password', code: 'invalid_format' }],
      },
    });
    const error = apiErrorFromResponse(response(422, body), body, 'req_header');

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('validation_failed');
    expect(error.requestId).toBe('req_header');
    expect(error.fieldCode('password')).toBe('invalid_format');
    expect(error.fieldCode('missing')).toBeUndefined();
    expect(error.fieldNames).toEqual(['password']);
  });

  it('falls back to the request_id inside the envelope when the header is absent', () => {
    const body = JSON.stringify({ error: { code: 'conflict', request_id: 'req_body' } });
    const error = apiErrorFromResponse(response(409, body), body, null);
    expect(error.requestId).toBe('req_body');
  });

  it('prefers the response header over the envelope request_id', () => {
    const body = JSON.stringify({ error: { code: 'conflict', request_id: 'req_body' } });
    const error = apiErrorFromResponse(response(409, body), body, 'req_header');
    expect(error.requestId).toBe('req_header');
  });

  it('ignores malformed field entries', () => {
    const body = JSON.stringify({
      error: { code: 'validation_failed', fields: [{ code: 'x' }, null, { name: 'email' }] },
    });
    const error = apiErrorFromResponse(response(422, body), body, null);
    expect(error.fields).toEqual([{ name: 'email', code: 'invalid_format' }]);
  });

  it('parses OAuth-style errors', () => {
    const body = JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired' });
    const error = apiErrorFromResponse(response(400, body), body, null);
    expect(error.code).toBe('invalid_grant');
    expect(error.message).toBe('Code expired');
  });

  it('falls back to the status line for non-JSON bodies', () => {
    const error = apiErrorFromResponse(response(500, '<html>boom</html>', 'Bad'), '', null);
    expect(error.status).toBe(500);
    expect(error.code).toBe('internal_error');
  });

  it('defaults 4xx codes to invalid_request', () => {
    const error = apiErrorFromResponse(response(404, '', 'Not Found'), '', null);
    expect(error.code).toBe('invalid_request');
  });
});

describe('errorI18nKey', () => {
  it('maps known codes', () => {
    expect(errorI18nKey('rate_limited')).toBe('errors.code.rate_limited');
    expect(errorI18nKey('network_error')).toBe('errors.code.network_error');
  });

  it('falls back for unknown codes', () => {
    expect(errorI18nKey('totally_unknown')).toBe('errors.code.internal_error');
  });
});

describe('fieldErrorI18nKey', () => {
  it('builds a nested key', () => {
    expect(fieldErrorI18nKey('avatar', 'too_large')).toBe('errors.field.avatar.too_large');
  });
});

describe('ApiError helpers', () => {
  it('detects instances and status', () => {
    const error = new ApiError({ status: 401, code: 'unauthorized', message: 'nope' });
    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isUnauthorized(error)).toBe(true);
    expect(error.is('unauthorized', 'forbidden')).toBe(true);
    expect(error.is('conflict')).toBe(false);
  });

  it('exposes defaults for optional fields', () => {
    const error = new ApiError({ status: 429, code: 'rate_limited', message: 'slow down' });
    expect(error.fields).toEqual([]);
    expect(error.requestId).toBeNull();
    expect(error.retryAfterSeconds).toBeNull();
  });
});
