import { apiGet, apiPost } from '../../http';
import { buildAdminSearch } from './query';
import type {
  AdminAuditEvent,
  AdminAuditQuery,
  AdminBackupExercise,
  AdminBackupExerciseStatus,
  AdminConfigurationVersion,
  AdminConfigurationVersionDetail,
  AdminKeyRotationApprovalInput,
  AdminKeyRotationCreateInput,
  AdminKeyRotationRequest,
  AdminPage,
} from './types';

export function listAdminAuditEvents(query: AdminAuditQuery = {}, signal?: AbortSignal) {
  const search = buildAdminSearch({
    limit: query.limit,
    cursor: query.cursor,
    actor_id: query.actor_id,
    resource_id: query.resource_id,
    action: query.action,
    result: query.result,
    from: query.from,
    until: query.until,
  });
  return apiGet<AdminPage<AdminAuditEvent>>(`/admin/v1/audit-events${search}`, {
    signal,
    scope: 'admin',
  });
}

export interface AdminConfigurationVersionsQuery {
  limit?: number;
  cursor?: string;
  q?: string;
}

export function listAdminConfigurationVersions(
  query: AdminConfigurationVersionsQuery = {},
  signal?: AbortSignal,
) {
  const search = buildAdminSearch({ limit: query.limit, cursor: query.cursor, q: query.q });
  return apiGet<AdminPage<AdminConfigurationVersion>>(`/admin/v1/configuration-versions${search}`, {
    signal,
    scope: 'admin',
  });
}

export function getAdminConfigurationVersion(configurationId: string, signal?: AbortSignal) {
  return apiGet<AdminConfigurationVersionDetail>(
    `/admin/v1/configuration-versions/${encodeURIComponent(configurationId)}`,
    { signal, scope: 'admin' },
  );
}

export function createAdminKeyRotation(input: AdminKeyRotationCreateInput) {
  return apiPost<AdminKeyRotationRequest>('/admin/v1/key-rotation-requests', input, {
    scope: 'admin',
  });
}

export function approveAdminKeyRotation(
  rotationId: string,
  input: AdminKeyRotationApprovalInput,
  etag: string,
) {
  return apiPost<AdminKeyRotationRequest>(
    `/admin/v1/key-rotation-requests/${encodeURIComponent(rotationId)}/approval-decisions`,
    input,
    { headers: { 'If-Match': etag }, scope: 'admin' },
  );
}

export interface AdminBackupExercisesQuery {
  limit?: number;
  cursor?: string;
  status?: AdminBackupExerciseStatus;
}

export function listAdminBackupExercises(
  query: AdminBackupExercisesQuery = {},
  signal?: AbortSignal,
) {
  const search = buildAdminSearch({
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
  });
  return apiGet<AdminPage<AdminBackupExercise>>(
    `/admin/v1/operations/backup-recovery-exercises${search}`,
    { signal, scope: 'admin' },
  );
}
