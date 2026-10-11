import { apiDelete, apiGet, apiPatch, apiPost } from '../http';
import type { Passkey, WebAuthnCeremony } from '../types';

export function listPasskeys(signal?: AbortSignal) {
  return apiGet<Passkey[]>('/v1/me/passkeys', { signal });
}

export function passkeyRegistrationOptions() {
  return apiPost<WebAuthnCeremony>('/v1/me/passkeys/registration-options');
}

export function passkeyRegistrationVerify(attestation: unknown, ceremonyId: string) {
  return apiPost<Passkey>('/v1/me/passkeys/registration-verify', attestation, {
    headers: { 'X-Passkey-Ceremony': ceremonyId },
  });
}

export function renamePasskey(passkeyId: string, label: string) {
  return apiPatch<Passkey>(`/v1/me/passkeys/${encodeURIComponent(passkeyId)}`, { label });
}

export function deletePasskey(passkeyId: string) {
  return apiDelete(`/v1/me/passkeys/${encodeURIComponent(passkeyId)}`);
}
