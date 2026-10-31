import {
  apiBlobOrNull,
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiRequest,
  apiVoid,
} from '../../http';
import { buildAdminSearch } from './query';
import type {
  AdminActivationRequestInput,
  AdminActivationRequestResult,
  AdminApprovalDecisionInput,
  AdminApprovalDecisionResult,
  AdminGrantRevocationInput,
  AdminMetadataImportInput,
  AdminPage,
  AdminApprovableKind,
  AdminResourceInput,
  AdminResourceKind,
  AdminResourceListQuery,
  AdminResourceView,
  AdminSecretRedeemInput,
  AdminSecretResult,
} from './types';

const KIND_PATHS: Record<AdminResourceKind, string> = {
  application: '/admin/v1/applications',
  oauth: '/admin/v1/oauth-clients',
  saml: '/admin/v1/saml-service-providers',
  federation: '/admin/v1/federation-providers',
};

export interface AdminResourceWithEtag {
  resource: AdminResourceView;
  etag: string;
}

export function listAdminResources(
  kind: AdminResourceKind,
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
    signal,
    scope: 'admin',
  });
}

export function getAdminResource(
  kind: AdminResourceKind,
  resourceId: string,
  signal?: AbortSignal,
) {
  return apiGetWithMeta<AdminResourceView>(
    `${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}`,
    {
      signal,
      scope: 'admin',
    },
  ).then(
    ({ data, meta }) => ({ resource: data, etag: meta.etag ?? '' }) satisfies AdminResourceWithEtag,
  );
}

export function createAdminResource(kind: AdminResourceKind, input: AdminResourceInput) {
  return apiPost<AdminResourceView>(KIND_PATHS[kind], input, { scope: 'admin' });
}

export function patchAdminResource(
  kind: AdminResourceKind,
  resourceId: string,
  input: AdminResourceInput,
  etag: string,
) {
  return apiRequest<AdminResourceView>(`${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}`, {
    method: 'PATCH',
    body: input,
    headers: { 'If-Match': etag },
    scope: 'admin',
  });
}

export function requestAdminActivation(
  kind: AdminApprovableKind,
  resourceId: string,
  input: AdminActivationRequestInput,
  etag: string,
) {
  return apiPost<AdminActivationRequestResult>(
    `${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}/activation-requests`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function decideAdminApproval(
  kind: 'federation',
  resourceId: string,
  input: AdminApprovalDecisionInput,
  etag: string,
) {
  return apiPost<AdminApprovalDecisionResult>(
    `${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}/approval-decisions`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export async function uploadApplicationLogo(resourceId: string, image: Blob, contentType: string) {
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return apiPut<undefined>(
    `/admin/v1/applications/${encodeURIComponent(resourceId)}/logo`,
    { media_type: contentType, content: btoa(binary) },
    { scope: 'admin' },
  );
}

export function deleteApplicationLogo(resourceId: string) {
  return apiVoid(`/admin/v1/applications/${encodeURIComponent(resourceId)}/logo`, {
    method: 'DELETE',
    scope: 'admin',
  });
}

export function getApplicationLogo(resourceId: string, signal?: AbortSignal) {
  return apiBlobOrNull(`/admin/v1/applications/${encodeURIComponent(resourceId)}/logo`, {
    accept: 'image/*',
    signal,
    scope: 'admin',
  });
}

export function addOauthRedirectUri(resourceId: string, input: { uri: string }, etag: string) {
  return apiPost<AdminResourceView>(
    `/admin/v1/oauth-clients/${encodeURIComponent(resourceId)}/redirect-uris`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function removeOauthRedirectUri(resourceId: string, childId: string, etag: string) {
  return apiVoid(
    `/admin/v1/oauth-clients/${encodeURIComponent(resourceId)}/redirect-uris/${encodeURIComponent(childId)}`,
    { method: 'DELETE', headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function redeemOauthClientSecret(
  resourceId: string,
  input: AdminSecretRedeemInput,
  etag: string,
) {
  return apiPost<AdminSecretResult>(
    `/admin/v1/oauth-clients/${encodeURIComponent(resourceId)}/secrets`,
    { ...input, overlap_seconds: input.overlap_seconds ?? 0 },
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function redeemOauthClientSecretRotation(
  resourceId: string,
  input: AdminSecretRedeemInput,
  etag: string,
) {
  return apiPost<AdminSecretResult>(
    `/admin/v1/oauth-clients/${encodeURIComponent(resourceId)}/secret-rotations`,
    { ...input, overlap_seconds: input.overlap_seconds ?? 0 },
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function revokeOauthClientGrants(resourceId: string, input: AdminGrantRevocationInput) {
  return apiVoid(`/admin/v1/oauth-clients/${encodeURIComponent(resourceId)}/grant-revocations`, {
    method: 'POST',
    body: input,
    scope: 'admin',
  });
}

export function importResourceMetadata(
  kind: 'saml' | 'federation',
  resourceId: string,
  input: AdminMetadataImportInput,
  etag: string,
) {
  return apiPost<AdminResourceView>(
    `${KIND_PATHS[kind]}/${encodeURIComponent(resourceId)}/metadata-imports`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function addSamlAcsUrl(resourceId: string, input: { uri: string }, etag: string) {
  return apiPost<AdminResourceView>(
    `/admin/v1/saml-service-providers/${encodeURIComponent(resourceId)}/acs-urls`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function removeSamlAcsUrl(resourceId: string, childId: string, etag: string) {
  return apiVoid(
    `/admin/v1/saml-service-providers/${encodeURIComponent(resourceId)}/acs-urls/${encodeURIComponent(childId)}`,
    { method: 'DELETE', headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function addSamlSigningCertificate(
  resourceId: string,
  input: { pem: string },
  etag: string,
) {
  return apiPost<AdminResourceView>(
    `/admin/v1/saml-service-providers/${encodeURIComponent(resourceId)}/signing-certificates`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function removeSamlSigningCertificate(resourceId: string, childId: string, etag: string) {
  return apiVoid(
    `/admin/v1/saml-service-providers/${encodeURIComponent(resourceId)}/signing-certificates/${encodeURIComponent(childId)}`,
    { method: 'DELETE', headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export function putSamlAttributePolicy(
  resourceId: string,
  input: { attribute_policy: Record<string, string> },
  etag: string,
) {
  return apiPut<AdminResourceView>(
    `/admin/v1/saml-service-providers/${encodeURIComponent(resourceId)}/attribute-policy`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}
