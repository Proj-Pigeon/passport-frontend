import { env } from '@/lib/env';

import { getCsrfToken, resetCsrfToken } from './csrf';
import { abortedError, ApiError, apiErrorFromResponse, isApiError, networkError } from './errors';
import { emitUnauthorized } from './unauthorized';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const WRITE_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  rawBody?: BodyInit;
  contentType?: string;
  accept?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipCsrf?: boolean;
  suppressUnauthorized?: boolean;
}

export function apiUrl(path: string): string {
  return `${env.apiBase}${path}`;
}

export function isWriteMethod(method: HttpMethod): boolean {
  return WRITE_METHODS.has(method);
}

export function resolveAssetUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return apiUrl(pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
}

async function exchange(path: string, options: ApiRequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  let response = await send(path, method, options);

  if (response.status === 403 && isWriteMethod(method) && !options.skipCsrf) {
    resetCsrfToken();
    response = await send(path, method, options);
  }

  if (response.ok) {
    return response;
  }

  const requestId = headerOf(response, 'x-request-id');
  const error = apiErrorFromResponse(response, await readText(response), requestId);
  if (error.status === 401 && !options.suppressUnauthorized) {
    emitUnauthorized({ path, method, requestId: error.requestId });
  }
  throw error;
}

async function send(
  path: string,
  method: HttpMethod,
  options: ApiRequestOptions,
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Accept', options.accept ?? headers.get('Accept') ?? 'application/json');

  const init: RequestInit = {};
  const write = isWriteMethod(method);

  if (options.rawBody !== undefined) {
    init.body = options.rawBody;
    if (options.contentType) {
      headers.set('Content-Type', options.contentType);
    }
  } else if (write) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.body ?? {});
  }

  if (write && !options.skipCsrf) {
    headers.set('X-CSRF-Token', await getCsrfToken());
  }

  try {
    return await fetch(apiUrl(path), {
      ...init,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) {
      throw abortedError();
    }
    throw networkError(cause);
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await exchange(path, options);
  return (await readPayload(response, response.status, headerOf(response, 'x-request-id'))) as T;
}

export async function apiVoid(path: string, options: ApiRequestOptions = {}): Promise<void> {
  await exchange(path, options);
}

export interface ApiBlobResult {
  blob: Blob;
  contentType: string | null;
  etag: string | null;
}

export async function apiBlobOrNull(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiBlobResult | null> {
  try {
    const response = await exchange(path, { ...options, accept: options.accept ?? '*/*' });
    if (response.status === 204 || response.status === 205) {
      return null;
    }
    return {
      blob: await response.blob(),
      contentType: headerOf(response, 'content-type'),
      etag: headerOf(response, 'etag'),
    };
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function apiGet<T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) {
  return apiRequest<T>(path, { ...options, method: 'GET' });
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
) {
  return apiRequest<T>(path, { ...options, method: 'POST', body });
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
) {
  return apiRequest<T>(path, { ...options, method: 'PUT', body });
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
) {
  return apiRequest<T>(path, { ...options, method: 'PATCH', body });
}

export function apiDelete<T = undefined>(
  path: string,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {},
) {
  return apiRequest<T>(path, { ...options, method: 'DELETE' });
}

async function readPayload(
  response: Response,
  status: number,
  requestId: string | null,
): Promise<unknown> {
  if (status === 204 || status === 205) {
    return undefined;
  }

  const text = await readText(response);
  if (text.length === 0) {
    return undefined;
  }

  const contentType = headerOf(response, 'content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError({
      status,
      code: 'invalid_request',
      message: 'The server returned a malformed JSON response.',
      requestId,
    });
  }
}

async function readText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function headerOf(response: Response, name: string): string | null {
  try {
    return response.headers.get(name);
  } catch {
    return null;
  }
}
