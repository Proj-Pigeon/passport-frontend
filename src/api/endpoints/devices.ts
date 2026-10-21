import { apiGet, apiVoid } from '../http';

export interface Device {
  id: string;
  kind: 'application' | 'browser';
  device_name: string;
  platform: string;
  client_id?: string;
  client_name?: string;
  scopes: string[];
  authorized_at: string;
  last_active_at: string;
  current: boolean;
}

export interface DevicePage {
  items: Device[];
  next_cursor?: string | null;
}

export interface DeviceAuthorization {
  client_id: string;
  client_name: string;
  device_name: string;
  platform: string;
  scopes: string[];
  expires_at: string;
  logo_url?: string;
  developer_name?: string;
  developer_url?: string;
}

export function getDeviceAuthorization(code: string, signal?: AbortSignal) {
  return apiGet<DeviceAuthorization>(`/v1/device-authorizations/${encodeURIComponent(code)}`, {
    signal,
  });
}

export function decideDeviceAuthorization(code: string, approve: boolean) {
  return apiVoid(
    `/v1/device-authorizations/${encodeURIComponent(code)}/${approve ? 'approve' : 'deny'}`,
    { method: 'POST' },
  );
}

export function listDevices(cursor?: string, signal?: AbortSignal, userId?: string) {
  const path = userId ? `/admin/v1/users/${encodeURIComponent(userId)}` : '/v1/me';
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiGet<DevicePage>(`${path}/devices${query}`, {
    signal,
    scope: userId ? 'admin' : 'account',
  });
}

export function revokeDevice(id: string, userId?: string, reason?: string) {
  const path = userId ? `/admin/v1/users/${encodeURIComponent(userId)}` : '/v1/me';
  return apiVoid(`${path}/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: userId ? { reason } : undefined,
    scope: userId ? 'admin' : 'account',
  });
}
