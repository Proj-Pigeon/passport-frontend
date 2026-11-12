import { apiGet, apiPost, apiVoid } from '../../http';

export type IdentityReviewState = 'pending' | 'approved' | 'rejected' | 'reset';

export interface IdentityRecord {
  id: string;
  session_id: string;
  status: string;
  review_state: IdentityReviewState;
  full_name_mask: string;
  document_number_mask: string;
  document_type: string;
  issuing_country: string;
  decision_at: string | null;
  created_at: string;
  updated_at: string;
  verified: boolean;
}

export interface MyIdentityResponse {
  enabled: boolean;
  identity: IdentityRecord | null;
  reverification_request: IdentityReverificationRequest | null;
}

export interface IdentityReverificationRequest {
  id: string;
  reason: string;
  created_at: string;
}

export interface IdentitySessionResponse {
  id: string;
  session_id: string;
  session_url: string;
  expires_at: string | null;
}

export function getMyIdentity(signal?: AbortSignal) {
  return apiGet<MyIdentityResponse>('/v1/me/identity', { signal, scope: 'account' });
}

export function createIdentitySession() {
  return apiPost<IdentitySessionResponse>('/v1/me/identity/sessions', undefined, {
    scope: 'account',
  });
}

export function refreshIdentitySession(id: string) {
  return apiPost<MyIdentityResponse>(
    `/v1/me/identity/sessions/${encodeURIComponent(id)}/refresh`,
    undefined,
    { scope: 'account' },
  );
}

export interface AdminIdentityResponse {
  identity: IdentityRecord | null;
  attempts: IdentityRecord[];
  reverification_request: IdentityReverificationRequest | null;
}

export interface AdminIdentityReveal {
  id: string;
  full_name: string;
  document_number: string;
  date_of_birth: string;
  document_type: string;
  issuing_country: string;
  images: Array<{
    kind: 'document_front' | 'document_back' | 'portrait' | 'selfie';
    url: string;
  }>;
}

export type AdminIdentityReviewDecision = 'approve' | 'reject' | 'reset';

export function getAdminUserIdentity(userId: string, signal?: AbortSignal) {
  return apiGet<AdminIdentityResponse>(`/admin/v1/users/${encodeURIComponent(userId)}/identity`, {
    signal,
    scope: 'admin',
  });
}

export function revealAdminUserIdentity(userId: string, id: string, reason?: string) {
  return apiPost<AdminIdentityReveal>(
    `/admin/v1/users/${encodeURIComponent(userId)}/identity/reveal`,
    { id, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
    { scope: 'admin' },
  );
}

export function reviewAdminUserIdentity(
  userId: string,
  id: string,
  decision: AdminIdentityReviewDecision,
  reason: string,
) {
  return apiVoid(`/admin/v1/users/${encodeURIComponent(userId)}/identity/review`, {
    method: 'POST',
    body: { id, decision, reason },
    scope: 'admin',
  });
}

export function requestAdminUserIdentityReverification(userId: string, reason: string) {
  return apiVoid(`/admin/v1/users/${encodeURIComponent(userId)}/identity/reverification-requests`, {
    method: 'POST',
    body: { reason },
    scope: 'admin',
  });
}

export function cancelAdminUserIdentityReverification(userId: string, id: string, reason: string) {
  return apiVoid(
    `/admin/v1/users/${encodeURIComponent(userId)}/identity/reverification-requests/${encodeURIComponent(id)}`,
    { method: 'DELETE', body: { reason }, scope: 'admin' },
  );
}

export function deleteAdminUserIdentity(userId: string, id: string, reason: string) {
  return apiVoid(
    `/admin/v1/users/${encodeURIComponent(userId)}/identity/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      body: { reason },
      scope: 'admin',
    },
  );
}

export function bindAdminUserIdentity(userId: string, id: string, reason: string) {
  return apiVoid(`/admin/v1/users/${encodeURIComponent(userId)}/identity/binding`, {
    method: 'POST',
    body: { id, reason },
    scope: 'admin',
  });
}
