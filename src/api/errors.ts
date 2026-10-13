export const API_ERROR_CODES = [
  'invalid_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'conflict',
  'request_too_large',
  'rate_limited',
  'dependency_unavailable',
  'internal_error',
  'precondition_failed',
  'precondition_required',
  'key_manager_unavailable',
  'key_job_pending',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const NETWORK_ERROR_CODE = 'network_error';
export const UNKNOWN_ERROR_CODE = 'internal_error';
export const ABORTED_ERROR_CODE = 'aborted';

export interface ApiFieldError {
  name: string;
  code: string;
}

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  requestId?: string | null;
  fields?: ApiFieldError[] | null;
  retryAfterSeconds?: number | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly fields: ApiFieldError[];
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message || init.code);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.fields = init.fields ?? [];
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  is(...codes: string[]): boolean {
    return codes.includes(this.code);
  }

  fieldCode(name: string): string | undefined {
    return this.fields.find((field) => field.name === name)?.code;
  }

  get fieldNames(): string[] {
    return this.fields.map((field) => field.name);
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isUnauthorized(value: unknown): boolean {
  return isApiError(value) && value.status === 401;
}

export function isCsrfRejection(value: unknown): boolean {
  return isApiError(value) && value.status === 403 && value.code === 'forbidden';
}

export function isAborted(value: unknown): boolean {
  return isApiError(value) && value.code === ABORTED_ERROR_CODE;
}

const KNOWN_CODES = new Set<string>([...API_ERROR_CODES, NETWORK_ERROR_CODE, ABORTED_ERROR_CODE]);

export function errorI18nKey(code: string): string {
  return KNOWN_CODES.has(code) ? `errors.code.${code}` : `errors.code.${UNKNOWN_ERROR_CODE}`;
}

export function fieldErrorI18nKey(field: string, code: string): string {
  return `errors.field.${field}.${code}`;
}

interface ErrorEnvelopeBody {
  error?: {
    code?: unknown;
    message?: unknown;
    request_id?: unknown;
    fields?: unknown;
  };
}

interface OAuthErrorBody {
  error?: unknown;
  error_description?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseFields(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const fields: ApiFieldError[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = asString(record['name']);
    if (!name) {
      continue;
    }
    fields.push({ name, code: asString(record['code']) ?? 'invalid_format' });
  }
  return fields;
}

export function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const seconds = Number.parseInt(headerValue, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  const date = Date.parse(headerValue);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.round((date - Date.now()) / 1000));
  }
  return null;
}

export function apiErrorFromResponse(
  response: Response,
  bodyText: string,
  requestId: string | null,
): ApiError {
  const fallbackCode = response.status >= 500 ? 'internal_error' : 'invalid_request';
  let code = fallbackCode;
  let message = response.statusText || fallbackCode;
  let fields: ApiFieldError[] = [];
  let bodyRequestId: string | undefined;

  if (bodyText.length > 0) {
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (typeof parsed === 'object' && parsed !== null) {
        const envelope = (parsed as ErrorEnvelopeBody).error;
        if (typeof envelope === 'object' && envelope !== null) {
          code = asString(envelope.code) ?? code;
          message = asString(envelope.message) ?? message;
          fields = parseFields(envelope.fields);
          bodyRequestId = asString(envelope.request_id);
        } else {
          const oauth = parsed as OAuthErrorBody;
          code = asString(oauth.error) ?? code;
          message = asString(oauth.error_description) ?? message;
        }
      }
    } catch {
      code = fallbackCode;
    }
  }

  return new ApiError({
    status: response.status,
    code,
    message,
    requestId: requestId ?? bodyRequestId ?? asString(readHeader(response, 'x-request-id')) ?? null,
    fields,
    retryAfterSeconds: parseRetryAfter(readHeader(response, 'retry-after')),
  });
}

function readHeader(response: Response, name: string): string | null {
  try {
    return response.headers.get(name);
  } catch {
    return null;
  }
}

export function networkError(cause: unknown): ApiError {
  const message = cause instanceof Error ? cause.message : 'Network request failed';
  return new ApiError({ status: 0, code: NETWORK_ERROR_CODE, message });
}

export function abortedError(): ApiError {
  return new ApiError({ status: 0, code: ABORTED_ERROR_CODE, message: 'Request aborted' });
}
