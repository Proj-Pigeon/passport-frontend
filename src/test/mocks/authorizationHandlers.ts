import { http, HttpResponse, type RequestHandler } from 'msw';
import type { AdminCapability, AdminRole } from '@/api/endpoints/admin/types';
import type { PermissionDefinition, PermissionGrants } from '@/api/endpoints/permissions';
import type {
  ResourceServer,
  ResourceServerChangeRequest,
  ResourceServerInput,
} from '@/api/endpoints/admin/resourceServers';
import { capabilitiesForRoles, currentUser, hasAdminStepUp, hasStepUp, type MockDb } from './db';
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

const validReason = (value: unknown) => {
  const length = [...str(value).trim()].length;
  return length >= 3 && length <= 1000;
};

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
  reason: string,
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
    reason,
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
      if (!db.adminSession?.roles.includes('super_admin') || db.adminSession.user_id === userId)
        return envelope(403, 'forbidden', 'A different super administrator is required.');
      const current = grantsFor(db, userId);
      const conflict = match(request, current.version);
      if (conflict) return conflict;
      const body = await readJson(request);
      if (!validReason(body?.reason))
        return envelope(400, 'invalid_request', 'A reason is required.');
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
    http.get(
      '*/v1/developer/applications',
      ({ request }) =>
        guard(db, request, 'account') ??
        HttpResponse.json({
          items: db.developerApplications
            .filter((item) => item.owner_user_id === currentUser(db)?.id)
            .map(({ owner_user_id: _owner, ...item }) => item),
        }),
    ),
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
      !db.developerApplications.some(
        (item) => item.id === id && item.owner_user_id === db.currentUserId,
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
        if (!code || !str(body?.name).trim() || !validReason(body?.reason))
          return envelope(400, 'invalid_request', 'Code, name and reason are required.');
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
          !validReason(body?.reason) ||
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
        const body = await readJson(request);
        if (!validReason(body?.reason))
          return envelope(400, 'invalid_request', 'A reason is required.');
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
        const body = await readJson(request);
        if (!validReason(body?.reason))
          return envelope(400, 'invalid_request', 'A reason is required.');
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
        !validReason(body?.reason) ||
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
      if (!validReason(body?.reason) || !str(body?.name) || !str(body?.audience))
        return envelope(400, 'invalid_request', 'Required fields are missing.');
      const input: ResourceServerInput = {
        name: str(body?.name),
        audience: str(body?.audience),
        client_ids: strings(body?.client_ids),
        reason: str(body?.reason),
      };
      if (!input.client_ids.length)
        return envelope(400, 'invalid_request', 'Client IDs are required.');
      if (server.status === 'active') {
        const result = requestChange(db, server, 'configuration', input.reason, {
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
      if (!validReason(body?.reason))
        return envelope(400, 'invalid_request', 'A reason is required.');
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
        return requestChange(db, server, action, str(body?.reason));
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
