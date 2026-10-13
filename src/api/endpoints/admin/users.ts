import { apiGet, apiVoid } from '../../http';
import { buildAdminSearch } from './query';
import type { AdminPage, AdminUserDetail, AdminUserSummary, AdminUsersQuery } from './types';

export function listAdminUsers(query: AdminUsersQuery = {}, signal?: AbortSignal) {
  const search = buildAdminSearch({
    limit: query.limit,
    cursor: query.cursor,
    q: query.q,
    status: query.status,
  });
  return apiGet<AdminPage<AdminUserSummary>>(`/admin/v1/users${search}`, {
    signal,
    scope: 'admin',
  });
}

export function getAdminUser(userId: string, signal?: AbortSignal) {
  return apiGet<AdminUserDetail>(`/admin/v1/users/${encodeURIComponent(userId)}`, {
    signal,
    scope: 'admin',
  });
}

export function suspendAdminUser(userId: string, reason: string) {
  return apiVoid(`/admin/v1/users/${encodeURIComponent(userId)}/suspension`, {
    method: 'POST',
    body: { reason },
    scope: 'admin',
  });
}

export function restoreAdminUser(userId: string, reason: string) {
  return apiVoid(`/admin/v1/users/${encodeURIComponent(userId)}/suspension`, {
    method: 'DELETE',
    body: { reason },
    scope: 'admin',
  });
}

export function revokeAdminUserSessions(userId: string, reason: string) {
  return apiVoid(`/admin/v1/users/${encodeURIComponent(userId)}/session-revocations`, {
    method: 'POST',
    body: { reason },
    scope: 'admin',
  });
}
