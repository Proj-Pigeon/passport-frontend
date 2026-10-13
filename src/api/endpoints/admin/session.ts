import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import { apiDelete, apiGet, apiPost, apiVoid } from '../../http';
import type { WebAuthnCeremony } from '@/api/types';
import type { AdminLoginRequest, AdminSessionInfo } from './types';

export type AdminPasskeyCeremony = WebAuthnCeremony<PublicKeyCredentialRequestOptionsJSON>;

export const ADMIN_SESSION_PATH = '/admin/v1/sessions/current';

export function getCurrentAdminSession(signal?: AbortSignal) {
  return apiGet<AdminSessionInfo>(ADMIN_SESSION_PATH, {
    signal,
    scope: 'admin',
    suppressUnauthorized: true,
  });
}

export function adminPasswordLogin(input: AdminLoginRequest) {
  return apiVoid('/admin/v1/sessions/password', {
    method: 'POST',
    body: input,
    scope: 'admin',
  });
}

export function adminPasskeyLoginOptions(identifier: string) {
  return apiPost<AdminPasskeyCeremony>(
    '/admin/v1/sessions/passkey/options',
    { identifier },
    {
      scope: 'admin',
    },
  );
}

export function adminPasskeyLoginVerify(assertion: AuthenticationResponseJSON, ceremonyId: string) {
  return apiVoid('/admin/v1/sessions/passkey/verify', {
    method: 'POST',
    body: assertion,
    headers: { 'X-Passkey-Ceremony': ceremonyId },
    scope: 'admin',
  });
}

export function logoutAdminSession() {
  return apiDelete(ADMIN_SESSION_PATH, { scope: 'admin' });
}

export function adminStepUpOptions() {
  return apiPost<AdminPasskeyCeremony>(
    '/admin/v1/sessions/current/step-up/passkey/options',
    {},
    { scope: 'admin' },
  );
}

export function adminStepUpVerify(assertion: AuthenticationResponseJSON, ceremonyId: string) {
  return apiVoid('/admin/v1/sessions/current/step-up/passkey/verify', {
    method: 'POST',
    body: assertion,
    headers: { 'X-Passkey-Ceremony': ceremonyId },
    scope: 'admin',
  });
}
