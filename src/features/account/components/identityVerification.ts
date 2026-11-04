export const DIDIT_ORIGIN = 'https://verify.didit.me';

export const identityKeys = {
  all: ['account', 'identity'] as const,
};

const MESSAGE_TYPES = new Set([
  'didit:completed',
  'didit:cancelled',
  'didit:error',
  'didit:close_request',
]);

export function embeddedUrl(sessionUrl: string): string {
  const url = new URL(sessionUrl);
  if (url.origin !== DIDIT_ORIGIN || url.username || url.password) {
    throw new Error('Invalid identity verification URL');
  }
  url.searchParams.set('sdk_presentation', 'embedded');
  return url.toString();
}

export function isMessageEnvelope(
  value: unknown,
): value is { type: string; data?: Record<string, unknown> | null } {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as { type?: unknown; data?: unknown };
  if (typeof envelope.type !== 'string' || !MESSAGE_TYPES.has(envelope.type)) return false;
  return (
    envelope.data === undefined ||
    (typeof envelope.data === 'object' && envelope.data !== null && !Array.isArray(envelope.data))
  );
}
