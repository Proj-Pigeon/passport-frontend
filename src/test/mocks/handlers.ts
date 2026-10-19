import { http, HttpResponse, type PathParams, type RequestHandler } from 'msw';

import type { ApiFieldError } from '@/api/errors';

import {
  consumeCeremony,
  currentUser,
  findUserByIdentifier,
  grantStepUp,
  hasStepUp,
  passkeyStepUpRequired,
  passkeysOf,
  signIn,
  signOut,
  startCeremony,
  stepUpSatisfied,
  type MockDb,
  type MockInteraction,
  type MockPasskey,
  type MockUser,
} from './db';

const REQUEST_ID = 'req_mock_handler';

export function envelope(
  status: number,
  code: string,
  message: string,
  fields?: ApiFieldError[],
  requestId = REQUEST_ID,
) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
        ...(fields && fields.length > 0 ? { fields } : {}),
      },
    },
    { status, headers: { 'X-Request-ID': requestId } },
  );
}

export function unauthorized() {
  return envelope(401, 'unauthorized', 'Authentication is required.');
}

export function notFound() {
  return envelope(404, 'not_found', 'The resource was not found.');
}

function csrfFailure(db: MockDb, request: Request): Response | null {
  if (!db.requireCsrf) {
    return null;
  }
  if (request.headers.get('x-csrf-token') === db.csrfToken) {
    return null;
  }
  return envelope(403, 'forbidden', 'A valid CSRF token is required.');
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,63}$/;

const AVATAR_MAX_BYTES = 512 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function sniffImage(content: Uint8Array): string | null {
  const matches = (signature: readonly number[]) =>
    content.length >= signature.length && signature.every((byte, index) => content[index] === byte);
  if (matches(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (matches(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  return null;
}

function passkeyOf(passkey: MockPasskey) {
  return {
    id: passkey.id,
    label: passkey.label,
    created_at: passkey.created_at,
    ...(passkey.last_used_at ? { last_used_at: passkey.last_used_at } : {}),
    backup_eligible: passkey.backup_eligible,
    backup_state: passkey.backup_state,
    aaguid: passkey.aaguid,
    authenticator_attachment: passkey.authenticator_attachment,
    transports: passkey.transports,
  };
}

function profileOf(db: MockDb, user: MockUser) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    email_verified: user.email_verified,
    ...(user.pending_email ? { pending_email: user.pending_email } : {}),
    status: user.status,
    avatar_url: db.avatar ? '/v1/me/avatar' : null,
    step_up_required: user.step_up_required,
  };
}

function interactionView(interaction: MockInteraction) {
  return {
    interaction_id: interaction.id,
    client_id: interaction.client_id,
    client_name: interaction.client_name,
    scopes: interaction.scopes,
    expires_at: interaction.expires_at,
  };
}

function interactionDecision(
  db: MockDb,
  params: PathParams,
  request: Request,
  action: 'approve' | 'deny',
): Response {
  const csrf = csrfFailure(db, request);
  if (csrf) {
    return csrf;
  }
  const user = currentUser(db);
  if (!db.session || !user) {
    return unauthorized();
  }
  const interaction = db.interactions.get(str(params['interactionId']));
  if (!interaction) {
    return notFound();
  }
  if (interaction.boundUserId === null) {
    interaction.boundUserId = user.id;
  }
  if (interaction.boundUserId !== user.id) {
    return notFound();
  }
  if (Date.parse(interaction.expires_at) <= Date.now()) {
    return envelope(
      409,
      'conflict',
      'The authorization interaction has expired or was already completed.',
    );
  }
  db.interactions.delete(interaction.id);
  return HttpResponse.json(
    { continue_url: action === 'approve' ? interaction.approveUrl : interaction.denyUrl },
    { headers: { 'X-Request-ID': REQUEST_ID } },
  );
}

import { createAdminHandlers } from './adminHandlers';

export function createHandlers(db: MockDb): RequestHandler[] {
  return [
    http.get('*/v1/me/devices', () =>
      db.session ? HttpResponse.json({ items: [], next_cursor: null }) : unauthorized(),
    ),
    http.get('*/admin/v1/users/:userId/devices', () =>
      HttpResponse.json({ items: [], next_cursor: null }),
    ),
    http.get('*/v1/compliance-documents', () =>
      HttpResponse.json({
        version: 1,
        terms_markdown: '# 用户协议\n\n请阅读用户协议。',
        privacy_markdown: '# 隐私政策\n\n请阅读隐私政策。',
        cross_border_enabled: false,
        cross_border_markdown: '',
        updated_at: '2026-10-14T00:00:00Z',
      }),
    ),
    http.get('*/v1/federation/providers', () => HttpResponse.json({ providers: [] })),
    ...createAdminHandlers(db),
    http.get('*/v1/auth/csrf', () =>
      HttpResponse.json(
        { token: db.csrfToken },
        { headers: { 'X-Request-ID': REQUEST_ID, 'Cache-Control': 'no-store' } },
      ),
    ),

    http.post('*/v1/registrations', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const body = await readJson(request);
      if (!body) {
        return envelope(400, 'invalid_request', 'A JSON request body is required.');
      }

      const username = str(body['username']).trim().toLowerCase();
      const email = str(body['email']).trim().toLowerCase();
      const password = str(body['password']);
      const displayName = str(body['display_name']).trim();

      const fields: ApiFieldError[] = [];
      if (!USERNAME_PATTERN.test(username) || username.length < 3) {
        fields.push({ name: 'username', code: 'invalid_format' });
      }
      if (!email.includes('@')) {
        fields.push({ name: 'email', code: 'invalid_format' });
      }
      if (password.length < 12 || password.length > 1024) {
        fields.push({ name: 'password', code: 'invalid_format' });
      }
      if ([...displayName].length > 80) {
        fields.push({ name: 'display_name', code: 'invalid_format' });
      }
      if (fields.length > 0) {
        return envelope(422, 'validation_failed', 'The request is not valid.', fields);
      }

      const taken = db.users.some((user) => user.username === username || user.email === email);
      if (taken) {
        return HttpResponse.json(
          { status: 'pending_verification' },
          { status: 201, headers: { 'X-Request-ID': REQUEST_ID } },
        );
      }

      const user: MockUser = {
        id: `usr_${db.users.length + 1}`,
        username,
        email,
        password,
        display_name: displayName,
        email_verified: false,
        status: 'pending_verification',
        has_password: true,
        step_up_required: true,
      };
      db.users.push(user);
      db.verificationTokens.set(`verify_${user.id}`, user.id);

      return HttpResponse.json(
        { user_id: user.id, status: 'pending_verification' },
        { status: 201, headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/v1/sessions/password', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const body = await readJson(request);
      if (!body) {
        return envelope(400, 'invalid_request', 'A JSON request body is required.');
      }

      const user = findUserByIdentifier(db, str(body['identifier']));
      if (!user || user.password !== str(body['password'])) {
        return unauthorized();
      }
      if (user.status === 'pending_verification' && !user.email_verified) {
        return envelope(
          403,
          'email_not_verified',
          'The email address for this account has not been verified.',
        );
      }
      if (!user.email_verified || user.status !== 'active') {
        return unauthorized();
      }

      signIn(db, user, 'pwd');
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/v1/sessions/current', () => {
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      return HttpResponse.json(
        {
          session: db.session,
          user: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            status: user.status,
            email: user.email,
            email_verified: user.email_verified,
            has_password: user.has_password,
            has_passkey: passkeysOf(db, user.id).length > 0,
            step_up_required: user.step_up_required,
          },
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.delete('*/v1/sessions/current', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      signOut(db);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/email-verification-requests', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      if (!currentUser(db)) {
        return unauthorized();
      }
      return new HttpResponse(null, { status: 202, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/email-verifications/confirm', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const body = await readJson(request);
      const token = str(body?.['token']);
      if (token.length < 20) {
        return envelope(400, 'invalid_request', 'The token is invalid.');
      }
      const userId = db.verificationTokens.get(token);
      if (!userId) {
        return envelope(400, 'invalid_request', 'The token is invalid or has expired.');
      }
      db.verificationTokens.delete(token);
      const user = db.users.find((entry) => entry.id === userId);
      if (user) {
        user.email_verified = true;
        user.status = 'active';
      }
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/recovery/password', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const body = await readJson(request);
      if (!body) {
        return envelope(400, 'invalid_request', 'A JSON request body is required.');
      }
      const email = str(body['email']).trim().toLowerCase();
      const user = db.users.find((entry) => entry.email === email);
      if (user) {
        db.resetTokens.set(`reset_${user.id}`, user.id);
      }
      return HttpResponse.json(
        { status: 'accepted' },
        { status: 202, headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/v1/recovery/password/reset', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const body = await readJson(request);
      if (!body) {
        return envelope(400, 'invalid_request', 'A JSON request body is required.');
      }
      const token = str(body['token']);
      const password = str(body['password']);
      const userId = db.resetTokens.get(token);
      if (token.length < 20 || !userId) {
        return envelope(400, 'invalid_request', 'The token is invalid or has expired.');
      }
      if (password.length < 12) {
        return envelope(422, 'validation_failed', 'The request is not valid.', [
          { name: 'password', code: 'invalid_format' },
        ]);
      }
      db.resetTokens.delete(token);
      const user = db.users.find((entry) => entry.id === userId);
      if (user) {
        user.password = password;
      }
      signOut(db);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/v1/me', () => {
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      return HttpResponse.json(profileOf(db, user), { headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.patch('*/v1/me', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      const body = await readJson(request);
      const hasDisplayName = body && typeof body['display_name'] === 'string';
      const hasStepUpRequired = body && typeof body['step_up_required'] === 'boolean';
      if (!hasDisplayName && !hasStepUpRequired) {
        return envelope(422, 'validation_failed', 'The request is not valid.', [
          { name: 'display_name', code: 'required' },
        ]);
      }
      if (hasDisplayName) {
        const displayName = str(body['display_name']).trim();
        if ([...displayName].length > 80) {
          return envelope(422, 'validation_failed', 'The request is not valid.', [
            { name: 'display_name', code: 'invalid_format' },
          ]);
        }
        user.display_name = displayName;
      }
      if (hasStepUpRequired) {
        user.step_up_required = body['step_up_required'] as boolean;
      }
      return HttpResponse.json(profileOf(db, user), { headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/v1/me/avatar', () => {
      if (!currentUser(db)) {
        return unauthorized();
      }
      if (!db.avatar) {
        return notFound();
      }
      return new HttpResponse(new Uint8Array(db.avatar.content), {
        headers: {
          'X-Request-ID': REQUEST_ID,
          'Content-Type': db.avatar.mediaType,
          ETag: '"mock-avatar-etag"',
        },
      });
    }),

    http.put('*/v1/me/avatar', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      if (!currentUser(db)) {
        return unauthorized();
      }
      const mediaType = (str(request.headers.get('content-type')).split(';')[0] ?? '').trim();
      if (mediaType !== 'image/jpeg' && mediaType !== 'image/png') {
        return envelope(422, 'validation_failed', 'The request is not valid.', [
          { name: 'avatar', code: 'unsupported_media_type' },
        ]);
      }
      const content = new Uint8Array(await request.arrayBuffer());
      const reject = (code: string) =>
        envelope(422, 'validation_failed', 'The request is not valid.', [{ name: 'avatar', code }]);
      if (content.length > AVATAR_MAX_BYTES) {
        return reject('too_large');
      }
      const sniffed = sniffImage(content);
      if (!sniffed) {
        return reject('invalid_image');
      }
      if (sniffed !== mediaType) {
        return reject('media_type_mismatch');
      }
      db.avatar = { mediaType, content };
      return HttpResponse.json(
        {
          url: '/v1/me/avatar',
          media_type: mediaType,
          width: 512,
          height: 512,
          bytes: content.length,
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.delete('*/v1/me/avatar', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      if (!currentUser(db)) {
        return unauthorized();
      }
      db.avatar = null;
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/me/external-identities/:slug/link-transactions', ({ params, request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      if (!stepUpSatisfied(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      const slug = str(params['slug']);
      if (db.takenExternalIdentities.has(slug)) {
        return envelope(409, 'conflict', 'The external identity cannot be linked to this account.');
      }
      return HttpResponse.json(
        {
          continue_url: `https://account.example/federation/${slug}/link/continue?state=st_mock_${slug}`,
        },
        { status: 201, headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.get('*/v1/me/external-identities', () => {
      if (!currentUser(db) || !db.session) {
        return unauthorized();
      }
      return HttpResponse.json(
        { identities: db.linkedExternalIdentities },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.delete('*/v1/me/external-identities/:identityId', ({ params, request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      if (!currentUser(db) || !db.session) {
        return unauthorized();
      }
      if (!stepUpSatisfied(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      const identityId = str(params['identityId']);
      const index = db.linkedExternalIdentities.findIndex((identity) => identity.id === identityId);
      if (index === -1) {
        return notFound();
      }
      db.linkedExternalIdentities.splice(index, 1);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/oauth2/authorize/interactions/:interactionId', ({ params }) => {
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      const interaction = db.interactions.get(str(params['interactionId']));
      if (!interaction) {
        return notFound();
      }
      if (interaction.boundUserId === null) {
        interaction.boundUserId = user.id;
      }
      if (interaction.boundUserId !== user.id) {
        return notFound();
      }
      return HttpResponse.json(interactionView(interaction), {
        headers: { 'X-Request-ID': REQUEST_ID },
      });
    }),

    http.post('*/oauth2/authorize/interactions/:interactionId/approve', ({ params, request }) =>
      interactionDecision(db, params, request, 'approve'),
    ),

    http.post('*/oauth2/authorize/interactions/:interactionId/deny', ({ params, request }) =>
      interactionDecision(db, params, request, 'deny'),
    ),

    http.post('*/v1/email-changes/confirm', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const body = await readJson(request);
      const token = str(body?.['token']);
      if (token.length < 20) {
        return envelope(400, 'invalid_request', 'The token is invalid.');
      }
      const userId = db.emailChangeTokens.get(token);
      if (!userId) {
        return envelope(400, 'invalid_request', 'The token is invalid or has expired.');
      }
      db.emailChangeTokens.delete(token);
      const user = db.users.find((entry) => entry.id === userId);
      if (user?.pending_email) {
        user.email = user.pending_email;
        user.email_verified = true;
        user.pending_email = undefined;
      }
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/email-change-requests', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      const body = await readJson(request);
      const newEmail = str(body?.['new_email']).trim().toLowerCase();
      const currentPassword = str(body?.['current_password']);
      const invalid = (name: string, code: string) =>
        envelope(422, 'validation_failed', 'The request is not valid.', [{ name, code }]);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return invalid('new_email', 'invalid_format');
      }
      if (newEmail === user.email) {
        return invalid('new_email', 'unchanged');
      }
      if (db.users.some((entry) => entry.id !== user.id && entry.email === newEmail)) {
        return invalid('new_email', 'already_in_use');
      }
      if (passkeyStepUpRequired(db, user)) {
        if (!hasStepUp(db)) {
          return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
        }
      } else if (currentPassword.length === 0) {
        return invalid('current_password', 'required');
      } else if (currentPassword !== user.password) {
        return invalid('current_password', 'incorrect');
      }
      const token = `emc_${'x'.repeat(24)}_${db.emailChangeTokens.size + 1}`;
      db.emailChangeTokens.set(token, user.id);
      user.pending_email = newEmail;
      return new HttpResponse(null, { status: 202, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/me/password', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      const body = await readJson(request);
      const currentPassword = str(body?.['current_password']);
      const newPassword = str(body?.['new_password']);
      const invalid = (name: string, code: string) =>
        envelope(422, 'validation_failed', 'The request is not valid.', [{ name, code }]);
      if (newPassword.length < 12) {
        return invalid('new_password', 'invalid_format');
      }
      if (currentPassword.length === 0) {
        return invalid('current_password', 'required');
      }
      if (currentPassword === newPassword) {
        return invalid('new_password', 'unchanged');
      }
      if (currentPassword !== user.password) {
        return invalid('current_password', 'incorrect');
      }
      if (passkeyStepUpRequired(db, user) && !hasStepUp(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      user.password = newPassword;
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/v1/me/passkeys', () => {
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      return HttpResponse.json(passkeysOf(db, user.id).map(passkeyOf), {
        headers: { 'X-Request-ID': REQUEST_ID },
      });
    }),

    http.post('*/v1/me/passkeys/registration-options', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      if (passkeysOf(db, user.id).length > 0 && !stepUpSatisfied(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      return HttpResponse.json(
        {
          ceremony_id: startCeremony(db, 'registration'),
          options: { publicKey: { challenge: 'bW9jay1jaGFsbGVuZ2U' } },
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/v1/me/passkeys/registration-verify', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      if (passkeysOf(db, user.id).length > 0 && !stepUpSatisfied(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      const ceremonyId = str(request.headers.get('x-passkey-ceremony'));
      if (!consumeCeremony(db, ceremonyId, 'registration')) {
        return envelope(409, 'conflict', 'The passkey ceremony is no longer valid.');
      }
      const body = await readJson(request);
      const credentialId = str(body?.['rawId'] ?? body?.['id']);
      if (db.passkeys.some((passkey) => passkey.credential_id === credentialId)) {
        return envelope(409, 'conflict', 'This passkey is already registered.');
      }
      const created: MockPasskey = {
        id: `pk_${db.passkeys.length + 1}`,
        user_id: user.id,
        credential_id: credentialId,
        label: '',
        created_at: new Date().toISOString(),
        last_used_at: null,
        backup_eligible: false,
        backup_state: false,
        transports: ['internal'],
      };
      db.passkeys.push(created);
      return HttpResponse.json(passkeyOf(created), {
        status: 201,
        headers: { 'X-Request-ID': REQUEST_ID },
      });
    }),

    http.patch('*/v1/me/passkeys/:passkeyId', async ({ params, request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      if (!stepUpSatisfied(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      const passkey = passkeysOf(db, user.id).find((entry) => entry.id === params['passkeyId']);
      if (!passkey) {
        return notFound();
      }
      const body = await readJson(request);
      const label = str(body?.['label']);
      if (typeof body?.['label'] !== 'string' || [...label].length > 80) {
        return envelope(422, 'validation_failed', 'The request is not valid.', [
          { name: 'label', code: 'invalid_format' },
        ]);
      }
      passkey.label = label;
      return HttpResponse.json(passkeyOf(passkey), { headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.delete('*/v1/me/passkeys/:passkeyId', ({ params, request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!user) {
        return unauthorized();
      }
      if (!stepUpSatisfied(db)) {
        return envelope(403, 'forbidden', 'A recent passkey step-up is required.');
      }
      const owned = passkeysOf(db, user.id);
      const passkey = owned.find((entry) => entry.id === params['passkeyId']);
      if (!passkey) {
        return notFound();
      }
      if (owned.length <= 1 && !user.has_password) {
        return envelope(403, 'forbidden', 'A password or another passkey is required.');
      }
      db.passkeys = db.passkeys.filter((entry) => entry.id !== passkey.id);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/sessions/current/step-up/password', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      if (!user.has_password) {
        return envelope(403, 'forbidden', 'This account does not have a password.');
      }
      const body = await readJson(request);
      if (str(body?.['password']) !== user.password) {
        return envelope(400, 'invalid_request', 'The password is incorrect.');
      }
      grantStepUp(db, undefined, 'password');
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/sessions/current/step-up/passkey/options', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      if (passkeysOf(db, user.id).length === 0) {
        return envelope(403, 'forbidden', 'A registered passkey is required for step-up.');
      }
      return HttpResponse.json(
        {
          ceremony_id: startCeremony(db, 'step_up'),
          options: { publicKey: { challenge: 'bW9jay1jaGFsbGVuZ2U' } },
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/v1/sessions/current/step-up/passkey/verify', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const user = currentUser(db);
      if (!db.session || !user) {
        return unauthorized();
      }
      const ceremonyId = str(request.headers.get('x-passkey-ceremony'));
      if (!consumeCeremony(db, ceremonyId, 'step_up')) {
        return envelope(409, 'conflict', 'The passkey ceremony is no longer valid.');
      }
      grantStepUp(db);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/v1/sessions/passkey/options', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      return HttpResponse.json(
        {
          ceremony_id: startCeremony(db, 'login'),
          options: { publicKey: { challenge: 'bW9jay1jaGFsbGVuZ2U' } },
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/v1/sessions/passkey/verify', async ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      const ceremonyId = str(request.headers.get('x-passkey-ceremony'));
      if (!consumeCeremony(db, ceremonyId, 'login')) {
        return envelope(409, 'conflict', 'The passkey ceremony is no longer valid.');
      }
      const body = await readJson(request);
      const credentialId = str(body?.['rawId'] ?? body?.['id']);
      const passkey = db.passkeys.find((entry) => entry.credential_id === credentialId);
      const user = passkey ? db.users.find((entry) => entry.id === passkey.user_id) : undefined;
      if (!passkey || !user || !user.email_verified || user.status !== 'active') {
        return unauthorized();
      }
      passkey.last_used_at = new Date().toISOString();
      signIn(db, user, 'passkey');
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/livez', () => new HttpResponse(null, { status: 200 })),

    http.get('*/readyz', () =>
      HttpResponse.json({ status: 'ready' }, { headers: { 'X-Request-ID': REQUEST_ID } }),
    ),
  ];
}
