import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api/errors';
import { grantStepUp, mockDb, seedPasskey, seedUser, server, signIn } from '@/test/mocks/server';

import {
  isPasskeyCancelled,
  isWebAuthnSupported,
  loginWithPasskey,
  registerPasskey,
  stepUpWithPasskey,
} from './webauthn';

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn(), createNewAbortSignal: vi.fn() },
}));

vi.mock('@simplewebauthn/browser', () => webauthn);

const ASSERTION = {
  id: 'cred_1',
  rawId: 'cred_1',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'Y2xpZW50RGF0YQ',
    authenticatorData: 'YXV0aERhdGE',
    signature: 'c2lnbmF0dXJl',
    userHandle: 'dXNyX3NlZWQ',
  },
};

const ATTESTATION = {
  id: 'cred_new',
  rawId: 'cred_new',
  type: 'public-key',
  clientExtensionResults: {},
  response: { clientDataJSON: 'Y2xpZW50RGF0YQ', attestationObject: 'YXR0ZXN0T2JqZWN0' },
};

function cancelledError(): DOMException {
  return new DOMException('The user does not wish to proceed', 'NotAllowedError');
}

beforeEach(() => {
  vi.clearAllMocks();
  webauthn.browserSupportsWebAuthn.mockReturnValue(true);
});

describe('isWebAuthnSupported', () => {
  it('mirrors the browser capability check', () => {
    expect(isWebAuthnSupported()).toBe(true);
    webauthn.browserSupportsWebAuthn.mockReturnValue(false);
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('treats a throwing capability check as unsupported', () => {
    webauthn.browserSupportsWebAuthn.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(isWebAuthnSupported()).toBe(false);
  });
});

describe('loginWithPasskey', () => {
  it('signs in the owner of the asserted credential', async () => {
    const user = seedUser(mockDb);
    seedPasskey(mockDb, { user_id: user.id, credential_id: 'cred_1' });
    webauthn.startAuthentication.mockResolvedValue(ASSERTION);

    await loginWithPasskey();

    expect(webauthn.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'bW9jay1jaGFsbGVuZ2U' },
    });
    expect(mockDb.currentUserId).toBe(user.id);
    expect(mockDb.session?.amr).toEqual(['passkey']);
  });

  it('sends the ceremony id back in the X-Passkey-Ceremony header', async () => {
    const user = seedUser(mockDb);
    seedPasskey(mockDb, { user_id: user.id, credential_id: 'cred_1' });
    webauthn.startAuthentication.mockResolvedValue(ASSERTION);

    let seenCeremony: string | null = null;
    let seenCsrf: string | null = null;
    server.use(
      http.post('*/v1/sessions/passkey/verify', ({ request }) => {
        seenCeremony = request.headers.get('x-passkey-ceremony');
        seenCsrf = request.headers.get('x-csrf-token');
        signIn(mockDb, user, 'passkey');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await loginWithPasskey();

    expect(seenCeremony).toMatch(/^wac_1_login$/);
    expect(seenCsrf).toBe(mockDb.csrfToken);
  });

  it('classifies a dismissed browser prompt as cancelled', async () => {
    webauthn.startAuthentication.mockRejectedValue(cancelledError());

    const error = await loginWithPasskey().catch((cause) => cause);
    expect(isPasskeyCancelled(error)).toBe(true);
    expect(error).toMatchObject({ kind: 'cancelled' });
  });

  it('surfaces an unknown authenticator failure without hiding it', async () => {
    webauthn.startAuthentication.mockRejectedValue(new DOMException('nope', 'SecurityError'));

    await expect(loginWithPasskey()).rejects.toMatchObject({ kind: 'failed' });
  });

  it('propagates a ceremony conflict from the server', async () => {
    webauthn.startAuthentication.mockResolvedValue(ASSERTION);
    server.use(
      http.post('*/v1/sessions/passkey/verify', () =>
        HttpResponse.json({ error: { code: 'conflict', message: 'consumed' } }, { status: 409 }),
      ),
    );

    const error = await loginWithPasskey().catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('conflict');
  });
});

describe('registerPasskey', () => {
  it('returns the stored credential', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    webauthn.startRegistration.mockResolvedValue(ATTESTATION);

    const created = await registerPasskey();

    expect(created.id).toMatch(/^pk_/);
    expect(mockDb.passkeys).toHaveLength(1);
    expect(mockDb.passkeys[0]?.credential_id).toBe('cred_new');
  });

  it('reports an already registered authenticator', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    grantStepUp(mockDb);
    webauthn.startRegistration.mockResolvedValue(ATTESTATION);
    server.use(
      http.post('*/v1/me/passkeys/registration-verify', () =>
        HttpResponse.json(
          { error: { code: 'conflict', message: 'already registered' } },
          { status: 409 },
        ),
      ),
    );

    const error = await registerPasskey().catch((cause) => cause);
    expect((error as ApiError).status).toBe(409);
  });
});

describe('stepUpWithPasskey', () => {
  it('opens a step-up window on the current session', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    seedPasskey(mockDb, { user_id: user.id, credential_id: 'cred_1' });
    webauthn.startAuthentication.mockResolvedValue(ASSERTION);

    await stepUpWithPasskey();

    expect(mockDb.session?.step_up_expires_at).toBeTruthy();
  });

  it('propagates the rejection for an account without passkeys', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    webauthn.startAuthentication.mockResolvedValue(ASSERTION);

    const error = await stepUpWithPasskey().catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect(webauthn.startAuthentication).not.toHaveBeenCalled();
  });
});
