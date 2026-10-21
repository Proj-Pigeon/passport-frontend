export type ApplicationPreset = 'web' | 'spa' | 'native' | 'saml' | 'device';

export const DEFAULT_SESSION_DURATION_HOURS = 2232;
export const MAX_SESSION_DURATION_HOURS = 8760;

export interface ProtocolDraft {
  redirectUris: string;
  scopes: string[];
  authMethod: 'client_secret_basic' | 'client_secret_post';
  subjectType: 'pairwise' | 'public';
  sessionDurationHours: number | '';
  entityId: string;
  acsUrls: string;
  certificate: string;
  requireSignedRequests: boolean;
  allowIdpInitiated: boolean;
}

export function sessionDurationSeconds(hours: number | ''): number {
  return typeof hours === 'number' && Number.isFinite(hours) && hours > 0
    ? Math.round(hours) * 3600
    : 0;
}

export function sessionDurationDays(seconds: number): number {
  return Math.round(seconds / 86400);
}

export function uriLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function validUris(value: string, required: boolean) {
  const lines = uriLines(value);
  if ((required && lines.length === 0) || lines.length > 32) return false;
  const seen = new Set<string>();
  return lines.every((line) => {
    try {
      const url = new URL(line);
      const loopback =
        url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
      if (
        line.length > 2048 ||
        /[\s*]/.test(line) ||
        line.includes('#') ||
        url.username ||
        url.password ||
        !url.hostname ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
      )
        return false;
      const normalized = url.href;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    } catch {
      return false;
    }
  });
}

export function protocolConfiguration(
  preset: ApplicationPreset,
  fields: ProtocolDraft,
  displayName: string,
): Record<string, unknown> {
  if (preset === 'saml') {
    return {
      display_name: displayName,
      entity_id: fields.entityId.trim(),
      acs_urls: uriLines(fields.acsUrls).map((uri) => ({ uri })),
      name_id_format: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      require_signed_requests: fields.requireSignedRequests,
      allow_idp_initiated: fields.allowIdpInitiated,
      attribute_policy: {},
      signing_certificates: fields.certificate.trim() ? [{ pem: fields.certificate.trim() }] : [],
    };
  }
  const sessionSeconds = sessionDurationSeconds(fields.sessionDurationHours);
  return {
    display_name: displayName,
    client_type: preset === 'web' ? 'confidential' : 'public',
    token_endpoint_auth_method: preset === 'web' ? fields.authMethod : 'none',
    subject_type: fields.subjectType,
    allowed_scopes: fields.scopes,
    require_consent: true,
    ...(sessionSeconds ? { refresh_token_ttl_seconds: sessionSeconds } : {}),
    redirect_uris: (preset === 'device' ? [] : uriLines(fields.redirectUris)).map((uri) => ({
      uri,
    })),
  };
}

export const APPLICATION_TYPES: ApplicationPreset[] = ['web', 'spa', 'native', 'device', 'saml'];

export function applicationType(value: unknown): ApplicationPreset | undefined {
  return APPLICATION_TYPES.includes(value as ApplicationPreset)
    ? (value as ApplicationPreset)
    : undefined;
}
