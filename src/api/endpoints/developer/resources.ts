import {
  apiBlobOrNull,
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiRequest,
  apiVoid,
} from '../../http';
import { buildAdminSearch } from '../admin/query';
import type { AdminProtocolInfo } from '../admin/federation';
import type {
  AdminActivationRequestInput,
  AdminActivationRequestResult,
  AdminGrantRevocationInput,
  AdminMetadataImportInput,
  AdminPage,
  AdminResourceInput,
  AdminResourceView,
  AdminResourceListQuery,
  AdminSecretRedeemInput,
  AdminSecretResult,
} from '../admin/types';

export type DeveloperResourceKind = 'application' | 'oauth' | 'saml';

const KIND_PATHS: Record<DeveloperResourceKind, string> = {
  application: '/v1/developer/applications',
  oauth: '/v1/developer/oauth-clients',
  saml: '/v1/developer/saml-service-providers',
};

export interface DeveloperOverviewPoint {
  date: string;
  count: number;
}

export interface DeveloperOverviewRange {
  start_date: string;
  end_date: string;
}

export interface DeveloperOverview extends DeveloperOverviewRange {
  window_days: number;
  generated_at: string;
  applications: number;
  active_applications: number;
  oauth_clients: number;
  saml_providers: number;
  users: number;
  active_users: number;
  daily_authorized: DeveloperOverviewPoint[];
}

export interface DeveloperResourceWithEtag {
  resource: AdminResourceView;
  etag: string;
}

export function getDeveloperOverview(range: DeveloperOverviewRange, signal?: AbortSignal) {
  const search = new URLSearchParams({ start_date: range.start_date, end_date: range.end_date });
  return apiGet<DeveloperOverview>(`/v1/developer/overview?${search}`, {
    scope: 'account',
    signal,
  });
}

export function getDeveloperProtocolInfo(signal?: AbortSignal) {
  return apiGet<AdminProtocolInfo>('/v1/developer/protocol-info', {
    scope: 'account',
    signal,
  });
}

export function listDeveloperResources(
  kind: DeveloperResourceKind,
  query: AdminResourceListQuery = {},
  signal?: AbortSignal,
) {
  const search = buildAdminSearch({
    limit: query.limit,
    cursor: query.cursor,
    q: query.q,
    status: query.status,
    application_id: query.application_id,
  });
  return apiGet<AdminPage<AdminResourceView>>(`${KIND_PATHS[kind]}${search}`, {
    scope: 'account',
    signal,
  });
}

export function getDeveloperResource(
  kind: DeveloperResourceKind,
  resourceId: string,
  signal?: AbortSignal,
) {
  return apiGetWithMeta<AdminResourceView>(
    `${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}`,
    {
      signal,
      scope: 'account',
    },
  ).then(({ data, meta }) => ({
    resource: data,
    etag: meta.etag ?? '',
  })) satisfies Promise<DeveloperResourceWithEtag>;
}

export function createDeveloperResource(kind: DeveloperResourceKind, input: AdminResourceInput) {
  return apiPost<AdminResourceView>(KIND_PATHS[kind], input, { scope: 'account' });
}

export function patchDeveloperResource(
  kind: DeveloperResourceKind,
  resourceId: string,
  input: AdminResourceInput,
  etag: string,
) {
  return apiRequest<AdminResourceView>(`${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}`, {
    method: 'PATCH',
    body: input,
    headers: { 'If-Match': etag },
    scope: 'account',
  });
}

export function requestDeveloperActivation(
  kind: DeveloperResourceKind,
  resourceId: string,
  input: AdminActivationRequestInput,
  etag: string,
) {
  return apiPost<AdminActivationRequestResult>(
    `${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}/activation-requests`,
    input,
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export async function uploadDeveloperApplicationLogo(
  resourceId: string,
  image: Blob,
  contentType: string,
) {
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return apiPut<undefined>(
    `/v1/developer/applications/${encodeURIComponent(resourceId)}/logo`,
    { media_type: contentType, content: btoa(binary) },
    { scope: 'account' },
  );
}

export function deleteDeveloperApplicationLogo(resourceId: string) {
  return apiVoid(`/v1/developer/applications/${encodeURIComponent(resourceId)}/logo`, {
    method: 'DELETE',
    scope: 'account',
  });
}

export function getDeveloperApplicationLogo(resourceId: string, signal?: AbortSignal) {
  return apiBlobOrNull(`/v1/developer/applications/${encodeURIComponent(resourceId)}/logo`, {
    accept: 'image/*',
    signal,
    scope: 'account',
  });
}

export function addDeveloperOauthRedirectUri(
  resourceId: string,
  input: { uri: string },
  etag: string,
) {
  return apiPost<AdminResourceView>(
    `/v1/developer/oauth-clients/${encodeURIComponent(resourceId)}/redirect-uris`,
    input,
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function removeDeveloperOauthRedirectUri(resourceId: string, childId: string, etag: string) {
  return apiVoid(
    `/v1/developer/oauth-clients/${encodeURIComponent(resourceId)}/redirect-uris/${encodeURIComponent(childId)}`,
    { method: 'DELETE', headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function redeemDeveloperOauthClientSecret(
  resourceId: string,
  input: AdminSecretRedeemInput,
  etag: string,
) {
  return apiPost<AdminSecretResult>(
    `/v1/developer/oauth-clients/${encodeURIComponent(resourceId)}/secrets`,
    { ...input, overlap_seconds: input.overlap_seconds ?? 0 },
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function redeemDeveloperOauthClientSecretRotation(
  resourceId: string,
  input: AdminSecretRedeemInput,
  etag: string,
) {
  return apiPost<AdminSecretResult>(
    `/v1/developer/oauth-clients/${encodeURIComponent(resourceId)}/secret-rotations`,
    { ...input, overlap_seconds: input.overlap_seconds ?? 0 },
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function revokeDeveloperOauthClientGrants(
  resourceId: string,
  input: AdminGrantRevocationInput,
) {
  return apiVoid(
    `/v1/developer/oauth-clients/${encodeURIComponent(resourceId)}/grant-revocations`,
    {
      method: 'POST',
      body: input,
      scope: 'account',
    },
  );
}

export function importDeveloperSamlMetadata(
  resourceId: string,
  input: AdminMetadataImportInput,
  etag: string,
) {
  return apiPost<AdminResourceView>(
    `/v1/developer/saml-service-providers/${encodeURIComponent(resourceId)}/metadata-imports`,
    input,
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function addDeveloperSamlAcsUrl(resourceId: string, input: { uri: string }, etag: string) {
  return apiPost<AdminResourceView>(
    `/v1/developer/saml-service-providers/${encodeURIComponent(resourceId)}/acs-urls`,
    input,
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function removeDeveloperSamlAcsUrl(resourceId: string, childId: string, etag: string) {
  return apiVoid(
    `/v1/developer/saml-service-providers/${encodeURIComponent(resourceId)}/acs-urls/${encodeURIComponent(childId)}`,
    { method: 'DELETE', headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function addDeveloperSamlSigningCertificate(
  resourceId: string,
  input: { pem: string },
  etag: string,
) {
  return apiPost<AdminResourceView>(
    `/v1/developer/saml-service-providers/${encodeURIComponent(resourceId)}/signing-certificates`,
    input,
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function removeDeveloperSamlSigningCertificate(
  resourceId: string,
  childId: string,
  etag: string,
) {
  return apiVoid(
    `/v1/developer/saml-service-providers/${encodeURIComponent(resourceId)}/signing-certificates/${encodeURIComponent(childId)}`,
    { method: 'DELETE', headers: { 'If-Match': etag }, scope: 'account' },
  );
}

export function putDeveloperSamlAttributePolicy(
  resourceId: string,
  input: { attribute_policy: Record<string, string> },
  etag: string,
) {
  return apiPut<AdminResourceView>(
    `/v1/developer/saml-service-providers/${encodeURIComponent(resourceId)}/attribute-policy`,
    input,
    { headers: { 'If-Match': etag }, scope: 'account' },
  );
}
