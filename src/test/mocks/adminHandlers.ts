import { http, HttpResponse, type RequestHandler } from 'msw';

import type {
  AdminCapability,
  AdminChangeRequest,
  AdminKeyRotationRequest,
  AdminPage,
  AdminResourceKind,
} from '@/api/endpoints/admin/types';

import {
  adminResourceView,
  adminRolesFor,
  consumeCeremony,
  findUserByIdentifier,
  grantAdminStepUp,
  hasAdminStepUp,
  passkeysOf,
  signInAdmin,
  signOutAdmin,
  startCeremony,
  type MockAdminResource,
  type MockDb,
} from './db';
import { federationPresets, protocolInfo } from './federationFixtures';
import { envelope, notFound, readJson, str, unauthorized } from './handlers';

const REQUEST_ID = 'req_mock_admin';

const RESOURCE_KINDS: ReadonlyArray<{ kind: AdminResourceKind; prefix: string }> = [
  { kind: 'application', prefix: '*/admin/v1/applications' },
  { kind: 'oauth', prefix: '*/admin/v1/oauth-clients' },
  { kind: 'saml', prefix: '*/admin/v1/saml-service-providers' },
  { kind: 'federation', prefix: '*/admin/v1/federation-providers' },
];

function readCapability(kind: AdminResourceKind): AdminCapability {
  return kind === 'federation' ? 'federation:read' : 'applications:read';
}

function writeCapability(kind: AdminResourceKind): AdminCapability {
  return kind === 'federation' ? 'federation:write' : 'applications:write';
}

function adminCsrfGuard(db: MockDb, request: Request): Response | null {
  if (db.requireCsrf && request.headers.get('x-csrf-token') !== db.adminCsrfToken) {
    return envelope(403, 'forbidden', 'A valid administrator CSRF token is required.');
  }
  return null;
}

function adminGuard(
  db: MockDb,
  request: Request,
  options: { capability?: AdminCapability; write?: boolean } = {},
): Response | null {
  if (!db.adminSession) {
    return unauthorized();
  }
  const unsafe = request.method !== 'GET' && request.method !== 'HEAD';
  if (unsafe && db.requireCsrf && request.headers.get('x-csrf-token') !== db.adminCsrfToken) {
    return envelope(403, 'forbidden', 'A valid administrator CSRF token is required.');
  }
  const { capability, write = false } = options;
  if (capability && !db.adminSession.capabilities.includes(capability)) {
    return envelope(403, 'forbidden', 'Administrator permission is required.');
  }
  if (write && !hasAdminStepUp(db)) {
    return envelope(403, 'forbidden', 'A recent passkey user-verification step-up is required.');
  }
  return null;
}

function ifMatchFailure(request: Request, version: number): Response | null {
  const header = request.headers.get('if-match');
  if (!header) {
    return envelope(428, 'precondition_required', 'An If-Match header is required.');
  }
  if (header !== `"${version}"`) {
    return envelope(412, 'precondition_failed', 'The resource version does not match.');
  }
  return null;
}

function paginate<T>(items: T[], request: Request): { page: T[]; nextCursor: string } {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 1),
    100,
  );
  const cursor = url.searchParams.get('cursor');
  const offset = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const page = items.slice(offset, offset + limit);
  const next = offset + limit;
  return { page, nextCursor: next < items.length ? String(next) : '' };
}

function pageJson<T>(page: T[], nextCursor: string) {
  const body: AdminPage<T> = { items: page, next_cursor: nextCursor };
  return HttpResponse.json(body, { headers: { 'X-Request-ID': REQUEST_ID } });
}

function findResource(db: MockDb, id: string): MockAdminResource | undefined {
  return db.adminResources.find((resource) => resource.id === id);
}

function bumpResource(resource: MockAdminResource): MockAdminResource {
  resource.version += 1;
  resource.updated_at = new Date().toISOString();
  return resource;
}

function resourceWithEtag(db: MockDb, resource: MockAdminResource) {
  return HttpResponse.json(adminResourceView(resource, db.adminResources), {
    headers: { 'X-Request-ID': REQUEST_ID, ETag: `"${resource.version}"` },
  });
}

function findChangeRequest(
  db: MockDb,
  changeRequestId: string,
): { resource: MockAdminResource; change: AdminChangeRequest } | undefined {
  for (const resource of db.adminResources) {
    const change = resource.change_requests.find((entry) => entry.id === changeRequestId);
    if (change) {
      return { resource, change };
    }
  }
  return undefined;
}

function newChangeRequest(
  resource: MockAdminResource,
  action: AdminChangeRequest['action'],
  reason: string,
  requestedBy: string,
): AdminChangeRequest {
  const change: AdminChangeRequest = {
    id: `cr_${resource.id}_${resource.change_requests.length + 1}`,
    action,
    base_version: resource.version,
    status: 'pending',
    policy_version: 'pol_mock_1',
    created_at: new Date().toISOString(),
    evaluated_diff: null,
    requested_by: requestedBy,
    reason,
  };
  resource.change_requests.push(change);
  return change;
}

function adminSessionView(db: MockDb) {
  const session = db.adminSession;
  if (!session) {
    return null;
  }
  return {
    user_id: session.user_id,
    username: session.username,
    session_id: session.session_id,
    roles: session.roles,
    capabilities: session.capabilities,
    amr: session.amr,
    step_up_expires_at: session.step_up_expires_at,
    step_up_fresh: hasAdminStepUp(db),
  };
}

export function createAdminHandlers(db: MockDb): RequestHandler[] {
  const handlers: RequestHandler[] = [];

  handlers.push(
    http.get('*/admin/v1/auth/csrf', () =>
      HttpResponse.json(
        { token: db.adminCsrfToken },
        { headers: { 'X-Request-ID': REQUEST_ID, 'Cache-Control': 'no-store' } },
      ),
    ),

    http.post('*/admin/v1/sessions/password', async ({ request }) => {
      const guard = adminCsrfGuard(db, request);
      if (guard) {
        return guard;
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
      const roles = adminRolesFor(db, user.id);
      if (roles.length === 0) {
        return envelope(403, 'forbidden', 'Administrator credentials are required.');
      }
      signInAdmin(db, user, roles);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/admin/v1/sessions/passkey/options', async ({ request }) => {
      const guard = adminCsrfGuard(db, request);
      if (guard) {
        return guard;
      }
      const body = await readJson(request);
      const user = findUserByIdentifier(db, str(body?.['identifier']));
      if (!user || adminRolesFor(db, user.id).length === 0) {
        return envelope(403, 'forbidden', 'Administrator credentials are required.');
      }
      return HttpResponse.json(
        {
          ceremony_id: startCeremony(db, 'admin_login'),
          options: { publicKey: { challenge: 'bW9jay1jaGFsbGVuZ2U' } },
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/admin/v1/sessions/passkey/verify', async ({ request }) => {
      const guard = adminCsrfGuard(db, request);
      if (guard) {
        return guard;
      }
      const ceremonyId = str(request.headers.get('x-passkey-ceremony'));
      if (!consumeCeremony(db, ceremonyId, 'admin_login')) {
        return envelope(409, 'conflict', 'The passkey ceremony is no longer valid.');
      }
      const body = await readJson(request);
      const credentialId = str(body?.['rawId'] ?? body?.['id']);
      const passkey = db.passkeys.find((entry) => entry.credential_id === credentialId);
      const user = passkey ? db.users.find((entry) => entry.id === passkey.user_id) : undefined;
      const roles = user ? adminRolesFor(db, user.id) : [];
      if (!user || roles.length === 0) {
        return unauthorized();
      }
      signInAdmin(db, user, roles, ['passkey']);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.get('*/admin/v1/sessions/current', () => {
      const view = adminSessionView(db);
      if (!view) {
        return unauthorized();
      }
      return HttpResponse.json(view, { headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.delete('*/admin/v1/sessions/current', ({ request }) => {
      const guard = adminGuard(db, request);
      if (guard) {
        return guard;
      }
      signOutAdmin(db);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/admin/v1/sessions/current/step-up/passkey/options', ({ request }) => {
      const guard = adminGuard(db, request);
      if (guard) {
        return guard;
      }
      const session = db.adminSession;
      if (!session || passkeysOf(db, session.user_id).length === 0) {
        return envelope(403, 'forbidden', 'A registered passkey is required for step-up.');
      }
      return HttpResponse.json(
        {
          ceremony_id: startCeremony(db, 'admin_step_up'),
          options: { publicKey: { challenge: 'bW9jay1jaGFsbGVuZ2U' } },
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/admin/v1/sessions/current/step-up/passkey/verify', ({ request }) => {
      const guard = adminGuard(db, request);
      if (guard) {
        return guard;
      }
      const ceremonyId = str(request.headers.get('x-passkey-ceremony'));
      if (!consumeCeremony(db, ceremonyId, 'admin_step_up')) {
        return envelope(409, 'conflict', 'The passkey ceremony is no longer valid.');
      }
      grantAdminStepUp(db);
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),
  );

  handlers.push(
    http.get('*/admin/v1/users', ({ request }) => {
      const guard = adminGuard(db, request, { capability: 'users:read' });
      if (guard) {
        return guard;
      }
      const url = new URL(request.url);
      const q = str(url.searchParams.get('q')).trim().toLowerCase();
      const status = str(url.searchParams.get('status'));
      const filtered = db.adminUsers.filter((user) => {
        const matchesQuery =
          q.length === 0 ||
          user.username.toLowerCase().includes(q) ||
          (user.display_name ?? '').toLowerCase().includes(q);
        const matchesStatus = status.length === 0 || user.status === status;
        return matchesQuery && matchesStatus;
      });
      const { page, nextCursor } = paginate(filtered, request);
      return pageJson(page, nextCursor);
    }),

    http.get('*/admin/v1/users/:userId', ({ params, request }) => {
      const guard = adminGuard(db, request, { capability: 'users:read' });
      if (guard) {
        return guard;
      }
      const user = db.adminUsers.find((entry) => entry.id === str(params['userId']));
      if (!user) {
        return notFound();
      }
      return HttpResponse.json(
        {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          status: user.status,
          security_epoch: user.security_epoch,
          created_at: user.created_at,
          updated_at: user.updated_at,
          security: {
            has_password: user.has_password,
            email_verified: user.email_verified,
            passkey_count: user.passkey_count,
            active_session_count: user.active_session_count,
            active_grant_count: user.active_grant_count,
          },
          external_identities: user.external_identities,
        },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/admin/v1/users/:userId/suspension', async ({ params, request }) => {
      const guard = adminGuard(db, request, { capability: 'users:write', write: true });
      if (guard) {
        return guard;
      }
      const user = db.adminUsers.find((entry) => entry.id === str(params['userId']));
      if (!user) {
        return notFound();
      }
      if (db.adminSession && user.id === db.adminSession.user_id) {
        return envelope(403, 'forbidden', 'Administrators cannot suspend themselves.');
      }
      if (user.status !== 'active') {
        return envelope(409, 'conflict', 'Only an active account can be suspended.');
      }
      user.status = 'suspended';
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.delete('*/admin/v1/users/:userId/suspension', async ({ params, request }) => {
      const guard = adminGuard(db, request, { capability: 'users:write', write: true });
      if (guard) {
        return guard;
      }
      const user = db.adminUsers.find((entry) => entry.id === str(params['userId']));
      if (!user) {
        return notFound();
      }
      if (user.status !== 'suspended') {
        return envelope(409, 'conflict', 'Only a suspended account can be restored.');
      }
      user.status = 'active';
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/admin/v1/users/:userId/session-revocations', ({ params, request }) => {
      const guard = adminGuard(db, request, { capability: 'users:write', write: true });
      if (guard) {
        return guard;
      }
      const user = db.adminUsers.find((entry) => entry.id === str(params['userId']));
      if (!user) {
        return notFound();
      }
      user.active_session_count = 0;
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),
  );

  handlers.push(
    http.get(
      '*/admin/v1/federation-providers/presets',
      ({ request }) =>
        adminGuard(db, request, { capability: 'federation:read' }) ??
        HttpResponse.json({ presets: federationPresets }),
    ),
    http.get(
      '*/admin/v1/protocol-info',
      ({ request }) => adminGuard(db, request) ?? HttpResponse.json(protocolInfo),
    ),
    http.put('*/admin/v1/federation-providers/:resourceId/secrets', async ({ request, params }) => {
      const guard = adminGuard(db, request, { capability: 'federation:write', write: true });
      if (guard) return guard;
      const resource = findResource(db, str(params['resourceId']));
      if (!resource || resource.kind !== 'federation') return notFound();
      const body = await readJson(request);
      const secret = str(body?.['secret']);
      if (
        secret.trim().length === 0 ||
        secret.length > 512 ||
        resource.configuration['provider_type'] === 'saml'
      )
        return envelope(422, 'validation_failed', 'Invalid secret.', [
          { name: 'secret', code: 'invalid_format' },
        ]);
      resource.secret_set = true;
      return HttpResponse.json({ secret_set: true });
    }),
    http.delete(
      '*/admin/v1/federation-providers/:resourceId/secrets',
      async ({ request, params }) => {
        const guard = adminGuard(db, request, { capability: 'federation:write', write: true });
        if (guard) return guard;
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'federation') return notFound();
        if (!resource.secret_set) return envelope(409, 'conflict', 'No stored secret.');
        resource.secret_set = false;
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
  for (const { kind, prefix } of RESOURCE_KINDS) {
    handlers.push(
      http.get(prefix, ({ request }) => {
        const guard = adminGuard(db, request, { capability: readCapability(kind) });
        if (guard) {
          return guard;
        }
        const url = new URL(request.url);
        const q = str(url.searchParams.get('q')).trim().toLowerCase();
        const status = str(url.searchParams.get('status'));
        const applicationId = str(url.searchParams.get('application_id'));
        const filtered = db.adminResources
          .filter((resource) => resource.kind === kind)
          .filter((resource) => q.length === 0 || resource.display_name.toLowerCase().includes(q))
          .filter((resource) => status.length === 0 || resource.status === status)
          .filter(
            (resource) => applicationId.length === 0 || resource.application_id === applicationId,
          );
        const { page, nextCursor } = paginate(filtered, request);
        return pageJson(
          page.map((resource) => adminResourceView(resource, db.adminResources)),
          nextCursor,
        );
      }),

      http.post(prefix, async ({ request }) => {
        const guard = adminGuard(db, request, { capability: writeCapability(kind), write: true });
        if (guard) {
          return guard;
        }
        const body = await readJson(request);
        if (!body) {
          return envelope(400, 'invalid_request', 'A JSON request body is required.');
        }
        const config = body['configuration'] as Record<string, unknown> | undefined;
        const displayName = str(body['display_name']) || str(config?.['display_name']);
        if (displayName.length === 0) {
          return envelope(422, 'validation_failed', 'The request is not valid.');
        }
        const configuration = body['configuration'];
        if (typeof configuration !== 'object' || configuration === null) {
          return envelope(422, 'validation_failed', 'The configuration must be an object.');
        }
        const applicationId = str(body['application_id']);
        const needsApplication = kind === 'oauth' || kind === 'saml';
        if (needsApplication && applicationId.length === 0) {
          return envelope(422, 'validation_failed', 'The application_id is required.');
        }
        if (applicationId && !findResource(db, applicationId)) {
          return envelope(422, 'validation_failed', 'The parent application does not exist.');
        }
        const now = new Date().toISOString();
        const resource: MockAdminResource = {
          id: `adr_${db.adminResources.length + 1}`,
          kind,
          ...(needsApplication ? { application_id: applicationId } : {}),
          ...(kind === 'oauth' ? { client_id: `oc_${db.adminResources.length + 1}` } : {}),
          display_name: displayName,
          status: 'draft',
          version: 1,
          configuration: configuration as Record<string, unknown>,
          published_configuration: null,
          configuration_version_id: null,
          change_requests: [],
          created_at: now,
          updated_at: now,
        };
        db.adminResources.push(resource);
        return HttpResponse.json(adminResourceView(resource, db.adminResources), {
          status: 201,
          headers: { 'X-Request-ID': REQUEST_ID, ETag: '"1"' },
        });
      }),

      http.get(`${prefix}/:resourceId`, ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: readCapability(kind) });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== kind) {
          return notFound();
        }
        return resourceWithEtag(db, resource);
      }),

      http.patch(`${prefix}/:resourceId`, async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: writeCapability(kind), write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== kind) {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        if (!body) {
          return envelope(400, 'invalid_request', 'A JSON request body is required.');
        }
        const config = body['configuration'] as Record<string, unknown> | undefined;
        const displayName = str(body['display_name']) || str(config?.['display_name']);
        if (displayName.length > 0) {
          resource.display_name = displayName;
        }
        const configuration = body['configuration'];
        if (typeof configuration === 'object' && configuration !== null) {
          resource.configuration = configuration as Record<string, unknown>;
        }
        return resourceWithEtag(db, bumpResource(resource));
      }),
    );

    handlers.push(
      http.post(`${prefix}/:resourceId/activation-requests`, async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: writeCapability(kind), write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource) {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        if (!body) {
          return envelope(400, 'invalid_request', 'A JSON request body is required.');
        }
        const action = str(body['action']);
        const reason = str(body['reason']);
        if (!['activate', 'deactivate', 'create_secret', 'rotate_secret'].includes(action)) {
          return envelope(422, 'validation_failed', 'The action is not supported.');
        }
        const targetResourceId = str(body['target_resource_id']);
        const targetResource = targetResourceId ? findResource(db, targetResourceId) : undefined;
        if (targetResourceId && !targetResource) {
          return envelope(422, 'validation_failed', 'The target resource does not exist.');
        }
        const change = newChangeRequest(
          targetResource ?? resource,
          action as AdminChangeRequest['action'],
          reason,
          db.adminSession?.user_id ?? 'unknown',
        );
        return HttpResponse.json(
          {
            id: change.id,
            status: change.status,
            base_version: change.base_version,
            policy_version: change.policy_version,
          },
          { status: 201, headers: { 'X-Request-ID': REQUEST_ID } },
        );
      }),

      http.post(`${prefix}/:resourceId/approval-decisions`, async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:approve' });
        if (guard) {
          return guard;
        }
        const pathId = str(params['resourceId']);
        const body = await readJson(request);
        if (!body) {
          return envelope(400, 'invalid_request', 'A JSON request body is required.');
        }
        const found = findChangeRequest(db, str(body['change_request_id']));
        if (!found) {
          return notFound();
        }
        const { resource, change } = found;
        const child = db.adminResources.find(
          (entry) => entry.application_id === resource.id && entry.id === pathId,
        );
        const belongsToPath =
          resource.id === pathId || resource.application_id === pathId || child !== undefined;
        if (!belongsToPath) {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, (child ?? resource).version);
        if (mismatch) {
          return mismatch;
        }
        const decision = str(body['decision']);
        if (decision !== 'approve' && decision !== 'reject') {
          return envelope(422, 'validation_failed', 'The decision is not supported.');
        }
        change.status = decision === 'approve' ? 'approved' : 'rejected';
        if (decision === 'approve' && change.action === 'activate') {
          const target = child ?? resource;
          target.status = 'active';
          target.published_configuration = { ...target.configuration };
        }
        if (decision === 'approve' && change.action === 'deactivate') {
          (child ?? resource).status = 'disabled';
        }
        return HttpResponse.json(
          {
            id: change.id,
            status: change.status,
            evaluated_diff: change.evaluated_diff ?? {},
            policy_version: change.policy_version,
          },
          { headers: { 'X-Request-ID': REQUEST_ID } },
        );
      }),
    );
  }

  handlers.push(
    http.post('*/admin/v1/oauth-clients/:resourceId/redirect-uris', async ({ params, request }) => {
      const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
      if (guard) {
        return guard;
      }
      const resource = findResource(db, str(params['resourceId']));
      if (!resource || resource.kind !== 'oauth') {
        return notFound();
      }
      const mismatch = ifMatchFailure(request, resource.version);
      if (mismatch) {
        return mismatch;
      }
      const body = await readJson(request);
      const uri = str(body?.['uri']);
      if (uri.length === 0) {
        return envelope(422, 'validation_failed', 'A redirect URI is required.');
      }
      const entries =
        (resource.configuration['redirect_uris'] as { id: string; uri: string }[]) ?? [];
      entries.push({ id: `ru_${entries.length + 1}`, uri });
      resource.configuration['redirect_uris'] = entries;
      return resourceWithEtag(db, bumpResource(resource));
    }),

    http.delete(
      '*/admin/v1/oauth-clients/:resourceId/redirect-uris/:childId',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'oauth') {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const childId = str(params['childId']);
        const entries =
          (resource.configuration['redirect_uris'] as { id: string; uri: string }[]) ?? [];
        resource.configuration['redirect_uris'] = entries.filter((entry) => entry.id !== childId);
        return resourceWithEtag(db, bumpResource(resource));
      },
    ),

    http.post('*/admin/v1/oauth-clients/:resourceId/grant-revocations', ({ request }) => {
      const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
      if (guard) {
        return guard;
      }
      return new HttpResponse(null, { status: 204, headers: { 'X-Request-ID': REQUEST_ID } });
    }),

    http.post('*/admin/v1/oauth-clients/:resourceId/secrets', async ({ params, request }) => {
      return redeemSecret(db, str(params['resourceId']), request, false);
    }),

    http.post(
      '*/admin/v1/oauth-clients/:resourceId/secret-rotations',
      async ({ params, request }) => {
        return redeemSecret(db, str(params['resourceId']), request, true);
      },
    ),

    http.post(
      '*/admin/v1/saml-service-providers/:resourceId/acs-urls',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'saml') {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        const uri = str(body?.['uri']);
        if (uri.length === 0) {
          return envelope(422, 'validation_failed', 'An ACS URL is required.');
        }
        const entries = (resource.configuration['acs_urls'] as { id: string; uri: string }[]) ?? [];
        entries.push({ id: `acs_${entries.length + 1}`, uri });
        resource.configuration['acs_urls'] = entries;
        return resourceWithEtag(db, bumpResource(resource));
      },
    ),

    http.delete(
      '*/admin/v1/saml-service-providers/:resourceId/acs-urls/:childId',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'saml') {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const childId = str(params['childId']);
        const entries = (resource.configuration['acs_urls'] as { id: string; uri: string }[]) ?? [];
        resource.configuration['acs_urls'] = entries.filter((entry) => entry.id !== childId);
        return resourceWithEtag(db, bumpResource(resource));
      },
    ),

    http.post(
      '*/admin/v1/saml-service-providers/:resourceId/signing-certificates',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'saml') {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        const pem = str(body?.['pem']);
        if (!pem.includes('BEGIN CERTIFICATE')) {
          return envelope(422, 'validation_failed', 'A PEM certificate is required.');
        }
        const entries =
          (resource.configuration['signing_certificates'] as { id: string; pem: string }[]) ?? [];
        entries.push({ id: `cert_${entries.length + 1}`, pem });
        resource.configuration['signing_certificates'] = entries;
        return resourceWithEtag(db, bumpResource(resource));
      },
    ),

    http.delete(
      '*/admin/v1/saml-service-providers/:resourceId/signing-certificates/:childId',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'saml') {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const childId = str(params['childId']);
        const entries =
          (resource.configuration['signing_certificates'] as { id: string; pem: string }[]) ?? [];
        resource.configuration['signing_certificates'] = entries.filter(
          (entry) => entry.id !== childId,
        );
        return resourceWithEtag(db, bumpResource(resource));
      },
    ),

    http.put(
      '*/admin/v1/saml-service-providers/:resourceId/attribute-policy',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource || resource.kind !== 'saml') {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        const policy = body?.['attribute_policy'];
        if (typeof policy !== 'object' || policy === null) {
          return envelope(422, 'validation_failed', 'The attribute policy must be an object.');
        }
        resource.configuration['attribute_policy'] = policy;
        return resourceWithEtag(db, bumpResource(resource));
      },
    ),

    http.post(
      '*/admin/v1/saml-service-providers/:resourceId/metadata-imports',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource) {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        const metadata = str(body?.['metadata']) || str(body?.['discovery_url']);
        if (metadata.length === 0) {
          return envelope(422, 'validation_failed', 'Metadata document is required.');
        }
        resource.configuration['imported_metadata'] = metadata.slice(0, 64);
        const view = bumpResource(resource);
        return HttpResponse.json(
          { ...view, trust_review_required: true },
          { headers: { 'X-Request-ID': REQUEST_ID } },
        );
      },
    ),

    http.post(
      '*/admin/v1/federation-providers/:resourceId/metadata-imports',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'federation:write', write: true });
        if (guard) {
          return guard;
        }
        const resource = findResource(db, str(params['resourceId']));
        if (!resource) {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, resource.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        const metadata = str(body?.['metadata']) || str(body?.['discovery_url']);
        if (metadata.length === 0) {
          return envelope(422, 'validation_failed', 'Metadata document is required.');
        }
        resource.configuration['imported_metadata'] = metadata.slice(0, 64);
        const view = bumpResource(resource);
        return HttpResponse.json(
          { ...view, trust_review_required: true },
          { headers: { 'X-Request-ID': REQUEST_ID } },
        );
      },
    ),

    http.get('*/admin/v1/audit-events', ({ request }) => {
      const guard = adminGuard(db, request, { capability: 'audit:read' });
      if (guard) {
        return guard;
      }
      const url = new URL(request.url);
      const actorId = str(url.searchParams.get('actor_id'));
      const resourceId = str(url.searchParams.get('resource_id'));
      const action = str(url.searchParams.get('action'));
      const result = str(url.searchParams.get('result'));
      const filtered = db.adminAuditEvents.filter((event) => {
        if (actorId.length > 0 && event.actor_id !== actorId) {
          return false;
        }
        if (resourceId.length > 0 && event.resource_id !== resourceId) {
          return false;
        }
        if (action.length > 0 && event.action !== action) {
          return false;
        }
        if (result.length > 0 && event.result !== result) {
          return false;
        }
        return true;
      });
      const { page, nextCursor } = paginate(filtered, request);
      return pageJson(page, nextCursor);
    }),

    http.get('*/admin/v1/configuration-versions', ({ request }) => {
      const guard = adminGuard(db, request, { capability: 'config:read' });
      if (guard) {
        return guard;
      }
      const { page, nextCursor } = paginate(db.adminConfigVersions, request);
      return pageJson(page, nextCursor);
    }),

    http.get('*/admin/v1/configuration-versions/:configurationId', ({ params, request }) => {
      const guard = adminGuard(db, request, { capability: 'config:read' });
      if (guard) {
        return guard;
      }
      const version = db.adminConfigVersions.find(
        (entry) => entry.id === str(params['configurationId']),
      );
      if (!version) {
        return notFound();
      }
      return HttpResponse.json(
        { ...version, document: { mock: true } },
        { headers: { 'X-Request-ID': REQUEST_ID } },
      );
    }),

    http.post('*/admin/v1/key-rotation-requests', async ({ request }) => {
      const guard = adminGuard(db, request, { capability: 'keys:write', write: true });
      if (guard) {
        return guard;
      }
      const body = await readJson(request);
      const protocol = str(body?.['protocol']);
      if (protocol !== 'oidc' && protocol !== 'saml') {
        return envelope(422, 'validation_failed', 'The protocol is not supported.');
      }
      const rotation: AdminKeyRotationRequest = {
        id: `kr_${db.adminKeyRotations.length + 1}`,
        protocol,
        state: 'staged',
        version: 1,
        execution_status: 'pending',
      };
      db.adminKeyRotations.push(rotation);
      return HttpResponse.json(rotation, {
        status: 201,
        headers: { 'X-Request-ID': REQUEST_ID },
      });
    }),

    http.post(
      '*/admin/v1/key-rotation-requests/:rotationId/approval-decisions',
      async ({ params, request }) => {
        const guard = adminGuard(db, request, { capability: 'keys:approve' });
        if (guard) {
          return guard;
        }
        const rotation = db.adminKeyRotations.find(
          (entry) => entry.id === str(params['rotationId']),
        );
        if (!rotation) {
          return notFound();
        }
        const mismatch = ifMatchFailure(request, rotation.version);
        if (mismatch) {
          return mismatch;
        }
        const body = await readJson(request);
        const state = str(body?.['state']);
        if (!['staged', 'published', 'active', 'retiring'].includes(state)) {
          return envelope(422, 'validation_failed', 'The state is not supported.');
        }
        rotation.state = state as (typeof rotation)['state'];
        rotation.version += 1;
        return HttpResponse.json(rotation, { headers: { 'X-Request-ID': REQUEST_ID } });
      },
    ),

    http.get('*/admin/v1/operations/backup-recovery-exercises', ({ request }) => {
      const guard = adminGuard(db, request, { capability: 'operations:read' });
      if (guard) {
        return guard;
      }
      const url = new URL(request.url);
      const status = str(url.searchParams.get('status'));
      const filtered = db.adminBackupExercises.filter(
        (exercise) => status.length === 0 || exercise.status === status,
      );
      const { page, nextCursor } = paginate(filtered, request);
      return pageJson(page, nextCursor);
    }),
  );

  return handlers;
}

async function redeemSecret(
  db: MockDb,
  resourceId: string,
  request: Request,
  rotation: boolean,
): Promise<Response> {
  const guard = adminGuard(db, request, { capability: 'applications:write', write: true });
  if (guard) {
    return guard;
  }
  const resource = findResource(db, resourceId);
  if (!resource || resource.kind !== 'oauth') {
    return notFound();
  }
  const body = await readJson(request);
  const found = findChangeRequest(db, str(body?.['change_request_id']));
  if (!found) {
    return envelope(404, 'not_found', 'The change request was not found.');
  }
  const { change } = found;
  if (change.action !== 'create_secret' && change.action !== 'rotate_secret') {
    return envelope(409, 'conflict', 'The change request is not a secret request.');
  }
  if (change.status !== 'approved') {
    return envelope(409, 'conflict', 'The change request has not been approved yet.');
  }
  if (db.adminSession && change.requested_by !== db.adminSession.user_id) {
    return envelope(403, 'forbidden', 'Only the requester may redeem the secret.');
  }
  if (rotation !== (change.action === 'rotate_secret')) {
    return envelope(409, 'conflict', 'The secret endpoint does not match the change action.');
  }
  change.status = 'applied';
  db.adminSecretCounter += 1;
  const overlapSeconds = Number(body?.['overlap_seconds']);
  return HttpResponse.json(
    {
      client_secret: `sec_mock_${db.adminSecretCounter}`,
      secret_version: db.adminSecretCounter,
      overlap_seconds: Number.isFinite(overlapSeconds) ? overlapSeconds : 0,
    },
    { status: 201, headers: { 'X-Request-ID': REQUEST_ID } },
  );
}
