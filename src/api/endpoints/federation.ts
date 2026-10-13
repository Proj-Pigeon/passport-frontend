import { apiUrl, apiPost, apiGet, apiDelete } from '../http';
import type { LinkTransaction } from '../types';

export function federationStartUrl(providerSlug: string): string {
  return apiUrl(`/federation/${encodeURIComponent(providerSlug)}/start`);
}

export function createLinkTransaction(providerSlug: string) {
  return apiPost<LinkTransaction>(
    `/v1/me/external-identities/${encodeURIComponent(providerSlug)}/link-transactions`,
  );
}

export interface LinkedIdentity {
  id: string;
  provider_slug: string;
  provider_display_name: string;
  display_name: string | null;
  email_hint: string | null;
  created_at: string;
  last_used_at: string | null;
}

export function listExternalIdentities(signal?: AbortSignal) {
  return apiGet<{ identities: LinkedIdentity[] }>('/v1/me/external-identities', { signal });
}

export function deleteExternalIdentity(identityId: string) {
  return apiDelete(`/v1/me/external-identities/${encodeURIComponent(identityId)}`);
}

export interface FederationProvider {
  slug: string;
  display_name: string;
  provider_type: 'oidc' | 'oauth2' | 'saml';
}

export function listFederationProviders(signal?: AbortSignal) {
  return apiGet<{ providers: FederationProvider[] }>('/v1/federation/providers', { signal });
}
