import { http, HttpResponse, type RequestHandler } from 'msw';
import type { AdminCapability, AdminChangeAction, AdminRole } from '@/api/endpoints/admin/types';
import type { PermissionDefinition, PermissionGrants } from '@/api/endpoints/permissions';
import type {
  ResourceServer,
  ResourceServerChangeRequest,
  ResourceServerInput,
} from '@/api/endpoints/admin/resourceServers';
import {
  adminResourceView,
  capabilitiesForRoles,
  hasAdminStepUp,
  hasStepUp,
  type MockAdminResource,
  type MockDb,
} from './db';
import { envelope, notFound, readJson, str, unauthorized } from './handlers';

const roles: AdminRole[] = [
  'super_admin',
  'user_admin',
  'application_admin',
  'application_approver',
  'federation_admin',
  'auditor',
  'key_admin',
  'key_approver',
  'operator',
  'developer',
];
const presetCodes = [
  'api.access',
  ...['osm', 'esri-imagery', 'opentopomap', 'viirs-night'].map(
    (provider) => `maps.${provider}.read`,
  ),
  ...[
    'jma_eew',
    'jma_eqlist',
    'cenc_eqlist',
    'sc_eew',
    'cenc_eew',
    'fj_eew',
    'cq_eew',
    'cwa_eew',
    'weather_rank',
  ].map((feed) => `wolfx.${feed}.read`),
];
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function guard(
  db: MockDb,
  request: Request,
  scope: 'admin' | 'account',
  capability?: AdminCapability,
) {
  if (scope === 'admin' ? !db.adminSession : !db.session) return unauthorized();
  if (capability && !db.adminSession?.capabilities.includes(capability))
    return envelope(403, 'forbidden', 'Administrator permission is required.');
  if (request.method !== 'GET') {
    if (
      db.requireCsrf &&
      request.headers.get('x-csrf-token') !== (scope === 'admin' ? db.adminCsrfToken : db.csrfToken)
    )
      return envelope(403, 'forbidden', 'A valid CSRF token is required.');
    if (!(scope === 'admin' ? hasAdminStepUp(db) : hasStepUp(db)))
      return envelope(
        403,
        scope === 'admin' ? 'forbidden' : 'account_step_up_required',
        'A recent verification is required.',
      );
  }
  return null;
}

function match(request: Request, version: number) {
  return request.headers.get('if-match') === `"${version}"`
    ? null
    : envelope(412, 'precondition_failed', 'The resource version does not match.');
}

function countedDefinition(db: MockDb, definition: PermissionDefinition): PermissionDefinition {
  return {
    ...definition,
    grant_count:
      definition.status === 'deleted'
        ? 0
        : [...db.permissionGrants.values()].filter((grants) =>
            [...grants.builtin_grants, ...grants.application_grants].some(
              (grant) => grant.id === definition.id,
            ),
          ).length,
  };
}

const DEVELOPER_KIND_PATHS: Record<'application' | 'oauth' | 'saml', string> = {
  application: '*/v1/developer/applications',
  oauth: '*/v1/developer/oauth-clients',
  saml: '*/v1/developer/saml-service-providers',
};

function developerGuard(db: MockDb, request: Request) {
  if (!db.session) return unauthorized();
  const roles = db.accountRolesOf.get(db.currentUserId ?? '') ?? [];
  if (!roles.includes('developer'))
    return envelope(403, 'forbidden', 'The developer role is required.');
  if (request.method !== 'GET') {
    if (db.requireCsrf && request.headers.get('x-csrf-token') !== db.csrfToken)
      return envelope(403, 'forbidden', 'A valid CSRF token is required.');
    if (!hasStepUp(db))
      return envelope(403, 'account_step_up_required', 'A recent verification is required.');
  }
  return null;
}

function ownedDeveloperResources(
  db: MockDb,
  kind: 'application' | 'oauth' | 'saml',
): (MockAdminResource & { owner_user_id?: string })[] {
  const userId = db.currentUserId ?? '';
  const ownedApplicationIds = new Set(
    db.developerResources
      .filter((item) => item.kind === 'application' && item.owner_user_id === userId)
      .map((item) => item.id),
  );
  return db.developerResources.filter(
    (item) =>
      item.kind === kind &&
      (item.kind === 'application'
        ? item.owner_user_id === userId
        : item.application_id !== undefined && ownedApplicationIds.has(item.application_id)),
  );
}

function developerEtag(resource: { version: number }) {
  return `"${resource.version}"`;
}

function grantsFor(db: MockDb, userId: string): PermissionGrants {
  const saved = db.permissionGrants.get(userId);
  const userRoles = saved?.roles ?? db.adminRolesOf.get(userId) ?? [];
  const builtin = (saved?.builtin_grants ?? [])
    .map((entry) => db.permissionDefinitions.find((item) => item.id === entry.id) ?? entry)
    .filter((item) => item.status !== 'deleted')
    .map((item) => countedDefinition(db, item));
  const applications = (saved?.application_grants ?? [])
    .map((entry) => db.permissionDefinitions.find((item) => item.id === entry.id) ?? entry)
    .filter((item) => item.status !== 'deleted')
    .map((item) => countedDefinition(db, item));
  return {
    version: saved?.version ?? 1,
    roles: userRoles,
    builtin_grants: builtin,
    application_grants: applications,
    role_capabilities: Object.fromEntries(
      roles.map((role) => [role, capabilitiesForRoles([role])]),
    ),
    effective_capabilities: [
      ...new Set([
        ...capabilitiesForRoles(userRoles as AdminRole[]).filter(
          (code) =>
            !db.permissionDefinitions.some(
              (item) => !item.application_id && item.code === code && item.status !== 'active',
            ),
        ),
        ...builtin.filter((item) => item.status === 'active').map((item) => item.code),
      ]),
    ],
  };
}

function soleApprover(db: MockDb) {
  const ids = new Set([
    ...db.adminRolesOf.keys(),
    ...db.permissionGrants.keys(),
    ...(db.adminSession ? [db.adminSession.user_id] : []),
  ]);
  const approvers = [...ids].filter((id) =>
    id === db.adminSession?.user_id
      ? db.adminSession.capabilities.includes('applications:approve')
      : grantsFor(db, id).effective_capabilities.includes('applications:approve'),
  );
  return approvers.length === 1 && approvers[0] === db.adminSession?.user_id;
}

const credentialAction = (action: string) =>
  action === 'issue_secret' || action === 'rotate_secret';
const snapshotOf = (server: ResourceServer) => ({
  name: server.name,
  audience: server.audience,
  client_ids: [...server.client_ids],
});

function credentialConflict(server: ResourceServer, change: ResourceServerChangeRequest) {
  return !credentialAction(change.action) ||
    (change.action === 'issue_secret' ? server.secret_set : !server.secret_set) ||
    change.snapshot.name !== server.name ||
    change.snapshot.audience !== server.audience ||
    JSON.stringify(change.snapshot.client_ids) !== JSON.stringify(server.client_ids)
    ? envelope(409, 'conflict', 'The reviewed credential configuration is stale.')
    : null;
}

function applyChange(server: ResourceServer, change: ResourceServerChangeRequest) {
  if (credentialAction(change.action)) {
    const conflict = credentialConflict(server, change);
    if (conflict) return conflict;
    change.status = 'approved';
  } else {
    if (
      change.action !== 'deactivate' &&
      (!server.secret_set || !change.snapshot.client_ids.length)
    )
      return envelope(409, 'conflict', 'A credential and enabled clients are required.');
    Object.assign(server, change.snapshot, {
      client_ids: [...change.snapshot.client_ids],
      status: change.action === 'deactivate' ? 'disabled' : 'active',
      version: server.version + 1,
    });
    change.status = 'applied';
  }
  return null;
}

function requestChange(
  db: MockDb,
  server: ResourceServer,
  action: string,
  snapshot = snapshotOf(server),
) {
  if (
    server.change_requests?.some(
      (item) => item.status === 'pending' && item.base_version === server.version,
    )
  )
    return envelope(409, 'conflict', 'Decide the pending resource change first.');
  const change: ResourceServerChangeRequest = {
    id: `chg_${server.id}_${server.version + 1}`,
    action,
    status: 'pending',
    requested_by: db.adminSession!.user_id,
    base_version: server.version + 1,
    snapshot,
  };
  const next = { ...server, version: server.version + 1 };
  if (soleApprover(db)) {
    const denied = applyChange(next, change);
    if (denied) return denied;
  }
  Object.assign(server, next);
  server.change_requests = [...(server.change_requests ?? []), change];
  return HttpResponse.json({ id: change.id, status: change.status }, { status: 201 });
}

export function createAuthorizationHandlers(db: MockDb): RequestHandler[] {
  const handlers: RequestHandler[] = [
    http.get(
      '*/admin/v1/permissions',
      ({ request }) =>
        guard(db, request, 'admin', 'applications:read') ??
        HttpResponse.json({
          items: db.permissionDefinitions.map((item) => countedDefinition(db, item)),
        }),
    ),
    http.get('*/admin/v1/users/:id/permission-grants', ({ request, params }) => {
      const denied = guard(db, request, 'admin', 'users:read');
      if (denied) return denied;
      const grants = grantsFor(db, String(params.id));
      return HttpResponse.json(grants, { headers: { ETag: `"${grants.version}"` } });
    }),
    http.put('*/admin/v1/users/:id/permission-grants', async ({ request, params }) => {
      const denied = guard(db, request, 'admin');
      if (denied) return denied;
      const userId = String(params.id);
      if (!db.adminSession?.roles.includes('super_admin') || userId === db.adminSession.user_id)
        return envelope(403, 'forbidden', 'Self authorization is not supported.');
      if (userId === db.adminSession?.user_id)
        return envelope(403, 'forbidden', 'Self authorization is not supported.');
      const current = grantsFor(db, userId);
      const conflict = match(request, current.version);
      if (conflict) return conflict;
      const body = await readJson(request);
      const builtin = strings(body?.builtin_permission_ids);
      const applications = strings(body?.application_permission_ids);
      const nextRoles = strings(body?.roles);
      if (
        nextRoles.some((role) => !roles.includes(role as AdminRole)) ||
        builtin.some(
          (id) =>
            !db.permissionDefinitions.some(
              (item) =>
                item.id === id &&
                !item.application_id &&
                (item.status === 'active' ||
                  (item.status === 'disabled' &&
                    current.builtin_grants.some((grant) => grant.id === id))),
            ),
        ) ||
        applications.some(
          (id) =>
            !db.permissionDefinitions.some(
              (item) =>
                item.id === id &&
                item.application_id &&
                (item.status === 'active' ||
                  (item.status === 'disabled' &&
                    current.application_grants.some((grant) => grant.id === id))),
            ),
        )
      )
        return envelope(400, 'invalid_request', 'Invalid permission selection.');
      db.permissionGrants.set(userId, {
        ...current,
        version: current.version + 1,
        roles: nextRoles,
        builtin_grants: db.permissionDefinitions.filter((item) => builtin.includes(item.id)),
        application_grants: db.permissionDefinitions.filter((item) =>
          applications.includes(item.id),
        ),
      });
      return HttpResponse.json(grantsFor(db, userId));
    }),
    http.get('*/v1/developer/applications', ({ request }) => {
      const denied = developerGuard(db, request);
      if (denied) return denied;
      const url = new URL(request.url);
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const status = url.searchParams.get('status');
      let items = ownedDeveloperResources(db, 'application');
      if (q) items = items.filter((item) => item.display_name.toLowerCase().includes(q));
      if (status) items = items.filter((item) => item.status === status);
      const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
      const page = items.slice(0, limit);
      return HttpResponse.json({
        items: page.map((item) => adminResourceView(item, db.developerResources)),
        next_cursor: items.length > limit ? `cursor_${limit}` : null,
      });
    }),
  ];

  for (const scope of ['admin', 'account'] as const) {
    const path =
      scope === 'admin'
        ? '*/admin/v1/applications/:id/permissions'
        : '*/v1/developer/applications/:id/permissions';
    const access = (request: Request, id: string) =>
      guard(
        db,
        request,
        scope,
        scope === 'admin'
          ? request.method === 'GET'
            ? 'applications:read'
            : 'applications:write'
          : undefined,
      ) ??
      (scope === 'account' &&
      !(
        db.developerApplications.some(
          (item) => item.id === id && item.owner_user_id === db.currentUserId,
        ) ||
        db.developerResources.some(
          (item) =>
            item.kind === 'application' &&
            item.id === id &&
            item.owner_user_id === db.currentUserId,
        )
      )
        ? notFound()
        : null);
    handlers.push(
      http.get(
        path,
        ({ request, params }) =>
          access(request, String(params.id)) ??
          HttpResponse.json({
            items: db.permissionDefinitions
              .filter((item) => item.application_id === params.id)
              .map((item) => countedDefinition(db, item)),
          }),
      ),
      http.post(path, async ({ request, params }) => {
        const denied = access(request, String(params.id));
        if (denied) return denied;
        const body = await readJson(request);
        const code = str(body?.code);
        if (!code || !str(body?.name).trim())
          return envelope(400, 'invalid_request', 'Code and name are required.');
        if (
          db.permissionDefinitions.some(
            (item) => item.application_id === params.id && item.code === code,
          )
        )
          return envelope(409, 'conflict', 'Permission code already exists.');
        const definition: PermissionDefinition = {
          id: `perm_${db.permissionDefinitions.length + 1}`,
          application_id: String(params.id),
          code,
          name: str(body?.name),
          description: str(body?.description),
          status: 'active',
          version: 1,
          grant_count: 0,
        };
        db.permissionDefinitions.push(definition);
        return HttpResponse.json(definition, { status: 201 });
      }),
      http.patch(`${path}/:permissionId`, async ({ request, params }) => {
        const denied = access(request, String(params.id));
        if (denied) return denied;
        const definition = db.permissionDefinitions.find(
          (item) => item.id === params.permissionId && item.application_id === params.id,
        );
        if (!definition || definition.status === 'deleted') return notFound();
        const conflict = match(request, definition.version);
        if (conflict) return conflict;
        const body = await readJson(request);
        if (
          !str(body?.name).trim() ||
          body?.code !== undefined ||
          !['active', 'disabled'].includes(str(body?.status))
        )
          return envelope(400, 'invalid_request', 'Invalid permission update.');
        Object.assign(definition, {
          name: str(body?.name),
          description: str(body?.description),
          status: body?.status,
          version: definition.version + 1,
        });
        return HttpResponse.json(countedDefinition(db, definition));
      }),
      http.delete(`${path}/:permissionId`, async ({ request, params }) => {
        const denied = access(request, String(params.id));
        if (denied) return denied;
        const definition = db.permissionDefinitions.find(
          (item) => item.id === params.permissionId && item.application_id === params.id,
        );
        if (!definition) return notFound();
        const conflict = match(request, definition.version);
        if (conflict) return conflict;
        definition.status = 'deleted';
        definition.version++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
  }
  handlers.push(
    http.post(
      '*/admin/v1/applications/:id/permissions/presets/guearth',
      async ({ request, params }) => {
        const denied = guard(db, request, 'admin', 'applications:write');
        if (denied) return denied;
        for (const code of presetCodes) {
          if (
            !db.permissionDefinitions.some(
              (item) => item.application_id === params.id && item.code === code,
            )
          )
            db.permissionDefinitions.push({
              id: `perm_${db.permissionDefinitions.length + 1}`,
              application_id: String(params.id),
              code,
              name: code,
              description: '',
              status: 'active',
              version: 1,
              grant_count: 0,
            });
        }
        return HttpResponse.json({
          items: db.permissionDefinitions
            .filter((item) => item.application_id === params.id)
            .map((item) => countedDefinition(db, item)),
        });
      },
    ),
  );

  // Developer panel: overview + ownership-scoped resource CRUD mirroring the
  // backend /v1/developer endpoints.
  handlers.push(
    http.get('*/v1/developer/overview', ({ request }) => {
      const denied = developerGuard(db, request);
      if (denied) return denied;
      const params = new URL(request.url).searchParams;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      let start = params.get('start_date');
      let end = params.get('end_date');
      if (params.has('start_date') || params.has('end_date')) {
        if (!start || !end || params.has('days'))
          return envelope(400, 'invalid_request', 'Provide both dates without days.');
      } else {
        const days = Number(params.get('days') ?? 30);
        if (!Number.isInteger(days) || days < 1 || days > 366)
          return envelope(400, 'invalid_request', 'Invalid day count.');
        end = today;
        start = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400_000)
          .toISOString()
          .slice(0, 10);
      }
      const validDate = (value: string) => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return (
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          Number.isFinite(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value
        );
      };
      if (!validDate(start) || !validDate(end) || start > end || end > today)
        return envelope(400, 'invalid_request', 'Invalid date range.');
      const startTime = Date.parse(`${start}T00:00:00Z`);
      const days = (Date.parse(`${end}T00:00:00Z`) - startTime) / 86400_000 + 1;
      const anniversary = new Date(startTime);
      anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
      if (
        days > 366 ||
        (params.has('start_date') && startTime + days * 86400_000 > anniversary.getTime())
      )
        return envelope(400, 'invalid_request', 'Date range exceeds 12 months.');
      const applications = ownedDeveloperResources(db, 'application');
      const daily: { date: string; count: number }[] = [];
      for (let offset = 0; offset < days; offset++) {
        const date = new Date(startTime + offset * 86400_000);
        daily.push({ date: date.toISOString().slice(0, 10), count: 0 });
      }
      return HttpResponse.json({
        start_date: start,
        end_date: end,
        window_days: days,
        generated_at: now.toISOString(),
        applications: applications.length,
        active_applications: applications.filter((item) => item.status === 'active').length,
        oauth_clients: ownedDeveloperResources(db, 'oauth').length,
        saml_providers: ownedDeveloperResources(db, 'saml').length,
        users: 0,
        active_users: 0,
        daily_authorized: daily,
      });
    }),
    http.get('*/v1/developer/protocol-info', ({ request }) => {
      const denied = developerGuard(db, request);
      if (denied) return denied;
      return HttpResponse.json({
        issuer: 'https://passport.example.com',
        oidc: {
          discovery_url: 'https://passport.example.com/.well-known/openid-configuration',
          authorization_endpoint: 'https://passport.example.com/v1/authorize',
          token_endpoint: 'https://passport.example.com/v1/token',
          jwks_uri: 'https://passport.example.com/v1/jwks',
          userinfo_endpoint: 'https://passport.example.com/v1/userinfo',
          revocation_endpoint: 'https://passport.example.com/v1/revocation',
          introspection_endpoint: 'https://passport.example.com/v1/introspection',
          end_session_endpoint: 'https://passport.example.com/v1/logout',
          scopes_supported: ['openid', 'profile', 'email'],
          code_challenge_methods: ['S256'],
          grant_types: ['authorization_code', 'refresh_token'],
          id_token_signing_alg: ['RS256'],
          subject_types: ['pairwise', 'public'],
        },
        saml: {
          available: false,
        },
      });
    }),
  );

  for (const [kind, path] of Object.entries(DEVELOPER_KIND_PATHS) as [
    'application' | 'oauth' | 'saml',
    string,
  ][]) {
    handlers.push(
      // The application list route is served by the merged handler above.
      ...(kind === 'application'
        ? []
        : [
            http.get(path, ({ request }) => {
              const denied = developerGuard(db, request);
              if (denied) return denied;
              const url = new URL(request.url);
              const q = (url.searchParams.get('q') ?? '').toLowerCase();
              const status = url.searchParams.get('status');
              const applicationId = url.searchParams.get('application_id');
              const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
              let items = ownedDeveloperResources(db, kind);
              if (applicationId)
                items = items.filter((item) => item.application_id === applicationId);
              if (q) items = items.filter((item) => item.display_name.toLowerCase().includes(q));
              if (status) items = items.filter((item) => item.status === status);
              const page = items.slice(0, limit);
              return HttpResponse.json({
                items: page.map((item) => adminResourceView(item, db.developerResources)),
                next_cursor: items.length > limit ? `cursor_${limit}` : null,
              });
            }),
          ]),
      http.get(`${path}/:id`, ({ request, params }) => {
        const denied = developerGuard(db, request);
        if (denied) return denied;
        const resource = ownedDeveloperResources(db, kind).find((item) => item.id === params.id);
        if (!resource) return notFound();
        return HttpResponse.json(adminResourceView(resource, db.developerResources), {
          headers: { ETag: developerEtag(resource) },
        });
      }),
      http.post(path, async ({ request }) => {
        const denied = developerGuard(db, request);
        if (denied) return denied;
        const body = (await readJson(request)) as {
          application_id?: unknown;
          configuration?: Record<string, unknown>;
        } | null;
        const displayName =
          typeof body?.configuration?.display_name === 'string'
            ? body.configuration.display_name.trim()
            : '';
        if (!displayName || [...displayName].length > 80)
          return envelope(400, 'invalid_request', 'The name or reason has an invalid length.');
        const index = db.developerResources.length + 1;
        const prefix = kind === 'application' ? 'apl' : kind === 'oauth' ? 'oc' : 'sp';
        const resource: MockAdminResource & { owner_user_id?: string } = {
          id: `${prefix}_dev_${index}`,
          kind,
          ...(kind !== 'application'
            ? { application_id: str(body?.application_id) || undefined }
            : {}),
          ...(kind === 'oauth' ? { client_id: `client_dev_${index}` } : {}),
          display_name: displayName,
          status: 'draft',
          version: 1,
          configuration: { ...(body?.configuration ?? {}) },
          published_configuration: null,
          configuration_version_id: null,
          change_requests: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(kind === 'application' ? { owner_user_id: db.currentUserId ?? '' } : {}),
        };
        db.developerResources.push(resource);
        return HttpResponse.json(adminResourceView(resource, db.developerResources), {
          status: 201,
        });
      }),
      http.patch(`${path}/:id`, async ({ request, params }) => {
        const denied = developerGuard(db, request);
        if (denied) return denied;
        const resource = ownedDeveloperResources(db, kind).find((item) => item.id === params.id);
        if (!resource) return notFound();
        const conflict = match(request, resource.version);
        if (conflict) return conflict;
        const body = await readJson(request);
        const configuration = (body?.configuration ?? {}) as Record<string, unknown>;
        resource.configuration = { ...resource.configuration, ...configuration };
        if (typeof configuration.display_name === 'string' && configuration.display_name)
          resource.display_name = configuration.display_name;
        const changeRequestId = `cr_dev_${resource.id}_${resource.version + 1}`;
        if (resource.status === 'active') {
          resource.published_configuration = { ...resource.configuration };
          resource.change_requests.push({
            id: changeRequestId,
            action: 'configuration',
            base_version: resource.version,
            status: 'applied',
            policy_version: 'developer-v1',
            created_at: new Date().toISOString(),
            evaluated_diff: null,
            requested_by: db.currentUserId ?? '',
          });
        }
        resource.version++;
        resource.updated_at = new Date().toISOString();
        return HttpResponse.json(
          {
            ...adminResourceView(resource, db.developerResources),
            ...(resource.status === 'active'
              ? { change_request_id: changeRequestId, change_request_status: 'applied' }
              : {}),
          },
          { headers: { ETag: developerEtag(resource) } },
        );
      }),
      http.post(`${path}/:id/activation-requests`, async ({ request, params }) => {
        const denied = developerGuard(db, request);
        if (denied) return denied;
        const resource = ownedDeveloperResources(db, kind).find((item) => item.id === params.id);
        if (!resource) return notFound();
        const conflict = match(request, resource.version);
        if (conflict) return conflict;
        const body = await readJson(request);
        const action = str(body?.action) || 'activate';
        if (!['activate', 'deactivate'].includes(action))
          return envelope(400, 'invalid_request', 'A valid action is required.');
        if (
          (action === 'activate' && resource.status === 'active') ||
          (action === 'deactivate' && resource.status !== 'active')
        )
          return envelope(409, 'conflict', 'The lifecycle state does not permit this action.');
        const changeId = `cr_dev_act_${resource.id}_${resource.version + 1}`;
        resource.change_requests.push({
          id: changeId,
          action: action as AdminChangeAction,
          base_version: resource.version,
          status: 'applied',
          policy_version: 'developer-v1',
          created_at: new Date().toISOString(),
          evaluated_diff: null,
          requested_by: db.currentUserId ?? '',
        });
        resource.version++;
        resource.status = action === 'activate' ? 'active' : 'disabled';
        if (action === 'activate') resource.published_configuration = { ...resource.configuration };
        return HttpResponse.json({ id: changeId, status: 'applied' }, { status: 201 });
      }),
    );
  }

  handlers.push(
    http.put('*/v1/developer/applications/:id/logo', async ({ request, params }) => {
      const denied = developerGuard(db, request);
      if (denied) return denied;
      if (!ownedDeveloperResources(db, 'application').some((item) => item.id === params.id))
        return notFound();
      const body = await readJson(request);
      if (!str(body?.content))
        return envelope(400, 'invalid_request', 'Image content is required.');
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('*/v1/developer/applications/:id/logo', ({ request, params }) => {
      const denied = developerGuard(db, request);
      if (denied) return denied;
      if (!ownedDeveloperResources(db, 'application').some((item) => item.id === params.id))
        return notFound();
      return new HttpResponse(null, { status: 404 });
    }),
    http.delete('*/v1/developer/applications/:id/logo', ({ request, params }) => {
      const denied = developerGuard(db, request);
      if (denied) return denied;
      if (!ownedDeveloperResources(db, 'application').some((item) => item.id === params.id))
        return notFound();
      return new HttpResponse(null, { status: 204 });
    }),
    ...['secrets', 'secret-rotations'].map((operation) =>
      http.post(`*/v1/developer/oauth-clients/:id/${operation}`, async ({ request, params }) => {
        const denied = developerGuard(db, request);
        if (denied) return denied;
        const resource = ownedDeveloperResources(db, 'oauth').find((item) => item.id === params.id);
        if (!resource) return notFound();
        const conflict = match(request, resource.version);
        if (conflict) return conflict;
        const body = await readJson(request);
        db.developerSecretCounter++;
        return HttpResponse.json(
          {
            client_secret: `dev_secret_${db.developerSecretCounter}`,
            secret_version: db.developerSecretCounter,
            overlap_seconds: Number(body?.overlap_seconds ?? 0),
          },
          { status: 201 },
        );
      }),
    ),
  );

  const servers = '*/admin/v1/resource-servers';
  handlers.push(
    http.get(
      servers,
      ({ request }) =>
        guard(db, request, 'admin', 'applications:read') ??
        HttpResponse.json({
          items: db.resourceServers.filter(
            (item) =>
              item.application_id === new URL(request.url).searchParams.get('application_id'),
          ),
        }),
    ),
    http.get(`${servers}/:id`, ({ request, params }) => {
      const denied = guard(db, request, 'admin', 'applications:read');
      if (denied) return denied;
      const server = db.resourceServers.find((item) => item.id === params.id);
      return server ? HttpResponse.json(server) : notFound();
    }),
    http.post(servers, async ({ request }) => {
      const denied = guard(db, request, 'admin', 'applications:write');
      if (denied) return denied;
      const body = await readJson(request);
      if (
        !str(body?.application_id) ||
        !str(body?.name).trim() ||
        !str(body?.audience).trim() ||
        !strings(body?.client_ids).length
      )
        return envelope(400, 'invalid_request', 'Required fields are missing.');
      const server = {
        id: `rs_${db.resourceServers.length + 1}`,
        application_id: str(body?.application_id),
        name: str(body?.name),
        audience: str(body?.audience),
        status: 'draft' as const,
        version: 1,
        client_ids: strings(body?.client_ids),
        secret_set: false,
        change_requests: [],
      };
      db.resourceServers.push(server);
      return HttpResponse.json(server, { status: 201 });
    }),
    http.patch(`${servers}/:id`, async ({ request, params }) => {
      const denied = guard(db, request, 'admin', 'applications:write');
      if (denied) return denied;
      const server = db.resourceServers.find((item) => item.id === params.id);
      if (!server) return notFound();
      const conflict = match(request, server.version);
      if (conflict) return conflict;
      const body = await readJson(request);
      if (!str(body?.name) || !str(body?.audience))
        return envelope(400, 'invalid_request', 'Required fields are missing.');
      const input: ResourceServerInput = {
        name: str(body?.name),
        audience: str(body?.audience),
        client_ids: strings(body?.client_ids),
      };
      if (!input.client_ids.length)
        return envelope(400, 'invalid_request', 'Client IDs are required.');
      if (server.status === 'active') {
        const result = requestChange(db, server, 'configuration', {
          name: input.name,
          audience: input.audience,
          client_ids: input.client_ids,
        });
        if (result.status !== 201) return result;
      } else {
        Object.assign(server, {
          name: input.name,
          audience: input.audience,
          client_ids: input.client_ids,
        });
        server.version++;
      }
      return HttpResponse.json(server);
    }),
    http.post(`${servers}/:id/:operation`, async ({ request, params }) => {
      const denied = guard(
        db,
        request,
        'admin',
        params.operation === 'approval-decisions' ? 'applications:approve' : 'applications:write',
      );
      if (denied) return denied;
      const server = db.resourceServers.find((item) => item.id === params.id);
      if (!server) return notFound();
      const conflict = match(request, server.version);
      if (conflict) return conflict;
      const body = await readJson(request);
      if (params.operation === 'secrets') {
        const change = server.change_requests?.find((item) => item.id === body?.change_request_id);
        if (!change) return notFound();
        if (change.requested_by !== db.adminSession!.user_id)
          return envelope(
            403,
            'forbidden',
            'Only the original requester may redeem an approved secret.',
          );
        if (change.status !== 'approved' || change.base_version !== server.version)
          return envelope(409, 'conflict', 'A matching unused approval is required.');
        const conflict = credentialConflict(server, change);
        if (conflict) return conflict;
        server.secret_set = true;
        server.version++;
        change.status = 'applied';
        db.adminSecretCounter++;
        return HttpResponse.json(
          {
            secret: `resource_secret_${db.adminSecretCounter}`,
            credential_id: `rsc_${db.adminSecretCounter}`,
          },
          { status: 201 },
        );
      }
      if (params.operation === 'activation-requests') {
        const action = str(body?.action);
        if (!['activate', 'deactivate', 'issue_secret', 'rotate_secret'].includes(action))
          return envelope(400, 'invalid_request', 'Invalid action.');
        if (
          (action === 'activate' && (server.status === 'active' || !server.secret_set)) ||
          (action === 'deactivate' && server.status !== 'active') ||
          (action === 'issue_secret' && server.secret_set) ||
          (action === 'rotate_secret' && !server.secret_set)
        )
          return envelope(409, 'conflict', 'Resource state does not permit this action.');
        return requestChange(db, server, action);
      }
      if (params.operation === 'approval-decisions') {
        const change = server.change_requests?.find((item) => item.id === body?.change_request_id);
        if (!change) return notFound();
        if (change.status !== 'pending')
          return envelope(409, 'conflict', 'Request is no longer pending.');
        if (change.requested_by === db.adminSession!.user_id && !soleApprover(db))
          return envelope(403, 'forbidden', 'An independent approver is required.');
        if (body?.decision === 'approve') {
          if (change.base_version !== server.version)
            return envelope(409, 'conflict', 'The reviewed resource configuration is stale.');
          const denied = applyChange(server, change);
          if (denied) return denied;
        } else if (body?.decision === 'reject') {
          change.status = 'rejected';
          server.version++;
        } else return envelope(400, 'invalid_request', 'Invalid decision.');
        return HttpResponse.json({ id: change.id, status: change.status });
      }
      return notFound();
    }),
  );
  return handlers;
}
