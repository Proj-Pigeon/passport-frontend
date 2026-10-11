import { http, HttpResponse, type RequestHandler } from 'msw';

import type { ApiFieldError } from '@/api/errors';

import {
  currentUser,
  findUserByIdentifier,
  signIn,
  signOut,
  type MockDb,
  type MockUser,
} from './db';

const REQUEST_ID = 'req_mock_handler';

function envelope(
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

function unauthorized() {
  return envelope(401, 'unauthorized', 'Authentication is required.');
}

function notFound() {
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

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
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

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,63}$/;

function profileOf(user: MockUser) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    email: user.email,
    email_verified: user.email_verified,
    status: user.status,
    avatar_url: null,
  };
}

export function createHandlers(db: MockDb): RequestHandler[] {
  return [
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
      return HttpResponse.json(profileOf(user), { headers: { 'X-Request-ID': REQUEST_ID } });
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
      if (!body || typeof body['display_name'] !== 'string') {
        return envelope(422, 'validation_failed', 'The request is not valid.', [
          { name: 'display_name', code: 'required' },
        ]);
      }
      user.display_name = str(body['display_name']).trim();
      return HttpResponse.json(profileOf(user), { headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/v1/me/passkeys', () => {
      if (!currentUser(db)) {
        return unauthorized();
      }
      return HttpResponse.json([], { headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/v1/me/avatar', () => {
      if (!currentUser(db)) {
        return unauthorized();
      }
      return notFound();
    }),

    http.post('*/v1/me/passkeys/registration-options', ({ request }) => {
      const csrf = csrfFailure(db, request);
      if (csrf) {
        return csrf;
      }
      if (!currentUser(db)) {
        return unauthorized();
      }
      return envelope(403, 'forbidden', 'Step-up authentication is required.');
    }),

    http.get('*/livez', () => new HttpResponse(null, { status: 200 })),

    http.get('*/readyz', () =>
      HttpResponse.json({ status: 'ready' }, { headers: { 'X-Request-ID': REQUEST_ID } }),
    ),
  ];
}
