import { env } from '@/lib/env';

import { ApiError, apiErrorFromResponse, networkError } from './errors';

const CSRF_PATH = '/v1/auth/csrf';

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

export function peekCsrfToken(): string | null {
  return cachedToken;
}

export function resetCsrfToken(): void {
  cachedToken = null;
}

export async function getCsrfToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }
  if (!inflight) {
    inflight = requestToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function requestToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBase}${CSRF_PATH}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw networkError(cause);
  }

  const text = await readBodyText(response);
  if (!response.ok) {
    throw apiErrorFromResponse(response, text, null);
  }

  let token: string | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      const candidate = (parsed as { token?: unknown }).token;
      if (typeof candidate === 'string' && candidate.length > 0) {
        token = candidate;
      }
    }
  } catch {
    token = null;
  }

  if (!token) {
    throw new ApiError({
      status: response.status,
      code: 'invalid_request',
      message: 'The CSRF token response was malformed.',
    });
  }

  cachedToken = token;
  return token;
}

async function readBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
