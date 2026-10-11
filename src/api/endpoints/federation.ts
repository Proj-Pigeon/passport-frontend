import { apiUrl, apiPost } from '../http';
import type { LinkTransaction } from '../types';

export function federationStartUrl(providerSlug: string): string {
  return apiUrl(`/federation/${encodeURIComponent(providerSlug)}/start`);
}

export function createLinkTransaction(providerSlug: string) {
  return apiPost<LinkTransaction>(
    `/v1/me/external-identities/${encodeURIComponent(providerSlug)}/link-transactions`,
  );
}
