import type { ApiScope } from '@/api/csrf';
import { apiGet, apiGetWithMeta, apiPatch, apiPost, apiPut, apiVoid } from '@/api/http';

export interface PermissionDefinition {
  id: string;
  application_id?: string;
  code: string;
  name: string;
  description: string;
  status: 'active' | 'disabled' | 'deleted';
  version: number;
  grant_count: number;
}

export interface PermissionCreateInput {
  code: string;
  name: string;
  description: string;
}

export interface PermissionUpdateInput {
  name: string;
  description: string;
  status: PermissionDefinition['status'];
}

export interface PermissionGrants {
  version: number;
  roles: string[];
  builtin_grants: PermissionDefinition[];
  application_grants: PermissionDefinition[];
  effective_capabilities: string[];
  role_capabilities: Record<string, string[]>;
}

export interface PermissionGrantsInput {
  roles: string[];
  builtin_permission_ids: string[];
  application_permission_ids: string[];
}

export interface DeveloperApplication {
  id: string;
  display_name: string;
  status: string;
}

export const permissionVersion = (version: number) => `"${version}"`;

function collection(scope: ApiScope, applicationId: string) {
  const prefix = scope === 'admin' ? '/admin/v1' : '/v1/developer';
  return `${prefix}/applications/${encodeURIComponent(applicationId)}/permissions`;
}

export function listPermissions(signal?: AbortSignal) {
  return apiGet<{ items: PermissionDefinition[] }>('/admin/v1/permissions', {
    scope: 'admin',
    signal,
  });
}

export function listApplicationPermissions(
  scope: ApiScope,
  applicationId: string,
  signal?: AbortSignal,
) {
  return apiGet<{ items: PermissionDefinition[] }>(collection(scope, applicationId), {
    scope,
    signal,
  });
}

export function createApplicationPermission(
  scope: ApiScope,
  applicationId: string,
  input: PermissionCreateInput,
) {
  return apiPost<PermissionDefinition>(collection(scope, applicationId), input, { scope });
}

export function updateApplicationPermission(
  scope: ApiScope,
  applicationId: string,
  definition: PermissionDefinition,
  input: PermissionUpdateInput,
) {
  return apiPatch<PermissionDefinition>(
    `${collection(scope, applicationId)}/${encodeURIComponent(definition.id)}`,
    input,
    {
      scope,
      headers: { 'If-Match': permissionVersion(definition.version) },
    },
  );
}

export function deleteApplicationPermission(
  scope: ApiScope,
  applicationId: string,
  definition: PermissionDefinition,
) {
  return apiVoid(`${collection(scope, applicationId)}/${encodeURIComponent(definition.id)}`, {
    scope,
    method: 'DELETE',
    headers: { 'If-Match': permissionVersion(definition.version) },
  });
}

export function initializeGuEarthPermissions(applicationId: string) {
  return apiVoid(`${collection('admin', applicationId)}/presets/guearth`, {
    method: 'POST',
    scope: 'admin',
  });
}

export function getPermissionGrants(userId: string, signal?: AbortSignal) {
  return apiGetWithMeta<PermissionGrants>(
    `/admin/v1/users/${encodeURIComponent(userId)}/permission-grants`,
    { scope: 'admin', signal },
  );
}

export function putPermissionGrants(userId: string, input: PermissionGrantsInput, etag: string) {
  return apiPut<PermissionGrants>(
    `/admin/v1/users/${encodeURIComponent(userId)}/permission-grants`,
    input,
    {
      scope: 'admin',
      headers: { 'If-Match': etag },
    },
  );
}

export function listDeveloperApplications(signal?: AbortSignal) {
  return apiGet<{ items: DeveloperApplication[] }>('/v1/developer/applications', {
    scope: 'account',
    signal,
  });
}
