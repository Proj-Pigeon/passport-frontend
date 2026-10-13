import { apiGet, apiPut, apiVoid } from '../../http';
import type { AdminResourceView } from './types';

export interface AdminFederationPresetField {
  name: string;
  kind?: 'text' | 'secret';
  required?: boolean;
}

export interface AdminFederationPreset {
  id: string;
  provider_type: 'oidc' | 'oauth2' | 'saml';
  slug?: string;
  icon: string;
  fixed?: Record<string, string>;
  defaults?: { scopes?: string[] };
  fields: AdminFederationPresetField[];
  hints?: Record<string, string>;
}

export interface AdminFederationPresetList {
  presets: AdminFederationPreset[];
}

export interface AdminProtocolInfo {
  issuer: string;
  oidc: {
    discovery_url: string;
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    userinfo_endpoint: string;
    revocation_endpoint: string;
    introspection_endpoint: string;
    end_session_endpoint: string;
    scopes_supported: string[];
    code_challenge_methods: string[];
    grant_types: string[];
    id_token_signing_alg: string[];
    subject_types: string[];
  };
  saml: {
    available: boolean;
    idp_entity_id?: string;
    sso_redirect_url?: string;
    sso_post_url?: string;
    metadata_url?: string;
    name_id_format?: string;
    signing_certificate_pem?: string;
    signing_certificate_fingerprint?: string;
  };
}

export interface AdminFederationResourceView extends AdminResourceView {
  secret_set?: boolean;
  sp_entity_id?: string;
  sp_acs_url?: string;
  sp_metadata_url?: string;
  sp_certificate_pem?: string;
  sp_certificate_fingerprint?: string;
}

export function listFederationPresets(signal?: AbortSignal) {
  return apiGet<AdminFederationPresetList>('/admin/v1/federation-providers/presets', {
    signal,
    scope: 'admin',
  });
}

export function getAdminProtocolInfo(signal?: AbortSignal) {
  return apiGet<AdminProtocolInfo>('/admin/v1/protocol-info', { signal, scope: 'admin' });
}

export function setFederationSecret(resourceId: string, input: { reason: string; secret: string }) {
  return apiPut<{ secret_set: boolean }>(
    `/admin/v1/federation-providers/${encodeURIComponent(resourceId)}/secrets`,
    input,
    { scope: 'admin' },
  );
}

export function clearFederationSecret(resourceId: string, input: { reason: string }) {
  return apiVoid(`/admin/v1/federation-providers/${encodeURIComponent(resourceId)}/secrets`, {
    method: 'DELETE',
    body: input,
    scope: 'admin',
  });
}
