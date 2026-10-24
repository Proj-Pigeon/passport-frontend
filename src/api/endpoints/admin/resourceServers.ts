import { apiGet, apiPatch, apiPost } from '@/api/http';
import { permissionVersion } from '../permissions';

export interface ResourceServerChangeRequest {
  id: string;
  action: string;
  status: string;
  reason: string;
  requested_by: string;
  base_version: number;
  snapshot: Pick<ResourceServer, 'name' | 'audience' | 'client_ids'>;
}

export interface ResourceServer {
  id: string;
  application_id: string;
  name: string;
  audience: string;
  status: 'draft' | 'active' | 'disabled';
  version: number;
  client_ids: string[];
  secret_set: boolean;
  change_requests?: ResourceServerChangeRequest[];
}

export interface ResourceServerInput {
  name: string;
  audience: string;
  client_ids: string[];
  reason: string;
}

export interface ResourceServerSecret {
  secret: string;
  credential_id: string;
}

const collection = '/admin/v1/resource-servers';
const detail = (id: string) => `${collection}/${encodeURIComponent(id)}`;
const options = (version: number) => ({
  scope: 'admin' as const,
  headers: { 'If-Match': permissionVersion(version) },
});

export function listResourceServers(applicationId: string, signal?: AbortSignal) {
  return apiGet<{ items: ResourceServer[] }>(
    `${collection}?${new URLSearchParams({ application_id: applicationId })}`,
    { scope: 'admin', signal },
  );
}

export function getResourceServer(id: string, signal?: AbortSignal) {
  return apiGet<ResourceServer>(detail(id), { scope: 'admin', signal });
}

export function createResourceServer(input: ResourceServerInput & { application_id: string }) {
  return apiPost<ResourceServer>(collection, input, { scope: 'admin' });
}

export function updateResourceServer(server: ResourceServer, input: ResourceServerInput) {
  return apiPatch<ResourceServer>(detail(server.id), input, options(server.version));
}

export function createResourceServerSecret(
  server: ResourceServer,
  reason: string,
  changeRequestId: string,
) {
  return apiPost<ResourceServerSecret>(
    `${detail(server.id)}/secrets`,
    { reason, change_request_id: changeRequestId },
    options(server.version),
  );
}

export function requestResourceServerActivation(
  server: ResourceServer,
  action: 'activate' | 'deactivate' | 'issue_secret' | 'rotate_secret',
  reason: string,
) {
  return apiPost<{ id: string; status: 'pending' | 'approved' | 'applied' }>(
    `${detail(server.id)}/activation-requests`,
    { action, reason },
    options(server.version),
  );
}

export function decideResourceServerApproval(
  server: ResourceServer,
  input: { change_request_id: string; decision: 'approve' | 'reject'; reason: string },
) {
  return apiPost<{ id: string; status: string }>(
    `${detail(server.id)}/approval-decisions`,
    input,
    options(server.version),
  );
}
