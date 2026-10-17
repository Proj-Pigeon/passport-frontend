import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

import { apiDelete, apiGet, apiPatch, apiPost } from '../http';
import type { Passkey, WebAuthnCeremony } from '../types';

export type PasskeyRegistrationCeremony = WebAuthnCeremony<PublicKeyCredentialCreationOptionsJSON>;

export function listPasskeys(signal?: AbortSignal) {
  return apiGet<Passkey[]>('/v1/me/passkeys', { signal });
}

export function passkeyRegistrationOptions() {
  return apiPost<PasskeyRegistrationCeremony>('/v1/me/passkeys/registration-options');
}

export function passkeyRegistrationVerify(
  attestation: RegistrationResponseJSON,
  ceremonyId: string,
) {
  return apiPost<Passkey>('/v1/me/passkeys/registration-verify', attestation, {
    headers: { 'X-Passkey-Ceremony': ceremonyId },
  });
}

export function renamePasskey(passkeyId: string, label: string) {
  return apiPatch<Pick<Passkey, 'id' | 'label'> & Partial<Passkey>>(
    `/v1/me/passkeys/${encodeURIComponent(passkeyId)}`,
    { label },
  );
}

export function deletePasskey(passkeyId: string) {
  return apiDelete(`/v1/me/passkeys/${encodeURIComponent(passkeyId)}`);
}
