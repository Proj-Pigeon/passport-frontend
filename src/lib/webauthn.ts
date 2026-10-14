import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';

import {
  adminPasskeyLoginOptions,
  adminPasskeyLoginVerify,
  adminStepUpOptions,
  adminStepUpVerify,
} from '@/api/endpoints/admin/session';
import { passkeyRegistrationOptions, passkeyRegistrationVerify } from '@/api/endpoints/passkeys';
import {
  passkeyLoginOptions,
  passkeyLoginVerify,
  stepUpPasskeyOptions,
  stepUpPasskeyVerify,
} from '@/api/endpoints/session';
import type { ComplianceVersions, Passkey } from '@/api/types';

export type PasskeyErrorKind = 'cancelled' | 'unsupported' | 'failed';

export class PasskeyError extends Error {
  readonly kind: PasskeyErrorKind;

  constructor(kind: PasskeyErrorKind, message: string) {
    super(message);
    this.name = 'PasskeyError';
    this.kind = kind;
  }
}

export function isPasskeyError(value: unknown): value is PasskeyError {
  return value instanceof PasskeyError;
}

export function isPasskeyCancelled(value: unknown): boolean {
  return isPasskeyError(value) && value.kind === 'cancelled';
}

export function isWebAuthnSupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

export function cancelPasskeyCeremony(): void {
  try {
    WebAuthnAbortService.cancelCeremony();
  } catch {
    // nothing to cancel
  }
}

const CANCELLED_DOM_NAMES = new Set(['NotAllowedError', 'AbortError']);

function propertyOf(cause: unknown, key: 'name' | 'message'): string {
  if (cause instanceof Error) {
    return cause[key];
  }
  if (typeof cause === 'object' && cause !== null) {
    const value = (cause as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return key === 'message' ? String(cause) : '';
}

function toPasskeyError(cause: unknown): PasskeyError {
  const message = propertyOf(cause, 'message');

  if (CANCELLED_DOM_NAMES.has(propertyOf(cause, 'name'))) {
    return new PasskeyError('cancelled', message);
  }
  if (message.includes('WebAuthn is not supported')) {
    return new PasskeyError('unsupported', message);
  }
  return new PasskeyError('failed', message);
}

export async function loginWithPasskey(complianceVersions: ComplianceVersions = {}): Promise<void> {
  const ceremony = await passkeyLoginOptions();
  const assertion = await startAuthentication({
    optionsJSON: ceremony.options.publicKey,
  }).catch((cause) => {
    throw toPasskeyError(cause);
  });
  await passkeyLoginVerify(assertion, ceremony.ceremony_id, complianceVersions);
}

export async function adminLoginWithPasskey(identifier: string): Promise<void> {
  const ceremony = await adminPasskeyLoginOptions(identifier);
  const assertion = await startAuthentication({
    optionsJSON: ceremony.options.publicKey,
  }).catch((cause) => {
    throw toPasskeyError(cause);
  });
  await adminPasskeyLoginVerify(assertion, ceremony.ceremony_id);
}

export async function stepUpWithPasskey(): Promise<void> {
  const ceremony = await stepUpPasskeyOptions();
  const assertion = await startAuthentication({
    optionsJSON: ceremony.options.publicKey,
  }).catch((cause) => {
    throw toPasskeyError(cause);
  });
  await stepUpPasskeyVerify(assertion, ceremony.ceremony_id);
}

export async function adminStepUpWithPasskey(): Promise<void> {
  const ceremony = await adminStepUpOptions();
  const assertion = await startAuthentication({
    optionsJSON: ceremony.options.publicKey,
  }).catch((cause) => {
    throw toPasskeyError(cause);
  });
  await adminStepUpVerify(assertion, ceremony.ceremony_id);
}

export async function registerPasskey(): Promise<Passkey> {
  const ceremony = await passkeyRegistrationOptions();
  const attestation = await startRegistration({
    optionsJSON: ceremony.options.publicKey,
  }).catch((cause) => {
    throw toPasskeyError(cause);
  });
  return passkeyRegistrationVerify(attestation, ceremony.ceremony_id);
}
