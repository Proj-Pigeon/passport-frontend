import { apiUrl, apiPost, apiGet, apiDelete } from '../http';
import type { LinkTransaction } from '../types';
import { safeNext } from '@/lib/safeNext';

export function federationStartUrl(
  providerSlug: string,
  complianceVersions: Record<string, number> = {},
  reauthentication?: { next: string | null },
): string {
  const query = new URLSearchParams();
  if (Object.keys(complianceVersions).length > 0) {
    query.set('compliance_versions', JSON.stringify(complianceVersions));
  }
  if (reauthentication) {
    query.set('reauth', 'required');
    const next = safeNext(reauthentication.next);
    if (next) query.set('next', next);
  }
  const search = query.size > 0 ? `?${query.toString()}` : '';
  return apiUrl(`/federation/${encodeURIComponent(providerSlug)}/start${search}`);
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
