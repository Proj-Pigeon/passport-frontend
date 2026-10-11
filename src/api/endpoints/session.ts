import { apiDelete, apiGet, apiPost, apiVoid } from '../http';
import type { CurrentSessionResponse, PasswordLoginRequest, WebAuthnCeremony } from '../types';

export const CURRENT_SESSION_PATH = '/v1/sessions/current';

export function getCurrentSession(signal?: AbortSignal) {
  return apiGet<CurrentSessionResponse>(CURRENT_SESSION_PATH, {
    signal,
    suppressUnauthorized: true,
  });
}

export function loginWithPassword(input: PasswordLoginRequest) {
  return apiVoid('/v1/sessions/password', { method: 'POST', body: input });
}

export function logoutCurrentSession() {
  return apiDelete(CURRENT_SESSION_PATH);
}

export function passkeyLoginOptions() {
  return apiPost<WebAuthnCeremony>('/v1/sessions/passkey/options');
}

export function passkeyLoginVerify(assertion: unknown, ceremonyId: string) {
  return apiVoid('/v1/sessions/passkey/verify', {
    method: 'POST',
    body: assertion,
    headers: { 'X-Passkey-Ceremony': ceremonyId },
  });
}

export function stepUpPasskeyOptions() {
  return apiPost<WebAuthnCeremony>('/v1/sessions/current/step-up/passkey/options');
}

export function stepUpPasskeyVerify(assertion: unknown, ceremonyId: string) {
  return apiVoid('/v1/sessions/current/step-up/passkey/verify', {
    method: 'POST',
    body: assertion,
    headers: { 'X-Passkey-Ceremony': ceremonyId },
  });
}
