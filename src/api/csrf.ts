import { env } from '@/lib/env';

import { ApiError, apiErrorFromResponse, networkError } from './errors';

export type ApiScope = 'account' | 'admin';

const CSRF_PATHS: Record<ApiScope, string> = {
  account: '/v1/auth/csrf',
  admin: '/admin/v1/auth/csrf',
};

interface CsrfState {
  token: string | null;
  inflight: Promise<string> | null;
}

const STATES = new Map<ApiScope, CsrfState>();

function stateOf(scope: ApiScope): CsrfState {
  let state = STATES.get(scope);
  if (!state) {
    state = { token: null, inflight: null };
    STATES.set(scope, state);
  }
  return state;
}

export function peekCsrfToken(scope: ApiScope = 'account'): string | null {
  return stateOf(scope).token;
}

export function resetCsrfToken(scope: ApiScope = 'account'): void {
  stateOf(scope).token = null;
}

export async function getCsrfToken(scope: ApiScope = 'account'): Promise<string> {
  const state = stateOf(scope);
  if (state.token) {
    return state.token;
  }
  if (!state.inflight) {
    state.inflight = requestToken(scope).finally(() => {
      state.inflight = null;
    });
  }
  return state.inflight;
}

async function requestToken(scope: ApiScope): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBase}${CSRF_PATHS[scope]}`, {
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

  stateOf(scope).token = token;
  return token;
}

async function readBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
