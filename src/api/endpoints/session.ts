import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import { apiDelete, apiGet, apiPost, apiVoid } from '../http';
import type {
  ComplianceVersions,
  CurrentSessionResponse,
  PasswordLoginRequest,
  WebAuthnCeremony,
} from '../types';

export type PasskeyAuthenticationCeremony = WebAuthnCeremony<PublicKeyCredentialRequestOptionsJSON>;

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
  return apiPost<PasskeyAuthenticationCeremony>('/v1/sessions/passkey/options');
}

export function passkeyLoginVerify(
  assertion: AuthenticationResponseJSON,
  ceremonyId: string,
  complianceVersions: ComplianceVersions,
) {
  return apiVoid('/v1/sessions/passkey/verify', {
    method: 'POST',
    body: assertion,
    headers: {
      'X-Passkey-Ceremony': ceremonyId,
      'X-Compliance-Versions': JSON.stringify(complianceVersions),
    },
  });
}

export function stepUpPasskeyOptions() {
  return apiPost<PasskeyAuthenticationCeremony>('/v1/sessions/current/step-up/passkey/options');
}

export function stepUpWithPassword(password: string) {
  return apiVoid('/v1/sessions/current/step-up/password', { method: 'POST', body: { password } });
}

export function stepUpPasskeyVerify(assertion: AuthenticationResponseJSON, ceremonyId: string) {
  return apiVoid('/v1/sessions/current/step-up/passkey/verify', {
    method: 'POST',
    body: assertion,
    headers: { 'X-Passkey-Ceremony': ceremonyId },
  });
}
