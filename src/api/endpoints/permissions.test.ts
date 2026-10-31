import { describe, expect, it } from 'vitest';
import {
  grantAccountRole,
  grantAdminStepUp,
  grantStepUp,
  seedDeveloperResource,
  seedUser,
  signIn,
  signInAdmin,
} from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import {
  createApplicationPermission,
  deleteApplicationPermission,
  getPermissionGrants,
  initializeGuEarthPermissions,
  listApplicationPermissions,
  listDeveloperApplications,
  putPermissionGrants,
  updateApplicationPermission,
} from './permissions';
import {
  createResourceServer,
  createResourceServerSecret,
  decideResourceServerApproval,
  getResourceServer,
  requestResourceServerActivation,
  updateResourceServer,
} from './admin/resourceServers';

function admin() {
  const user = seedUser(mockDb);
  signInAdmin(mockDb, user, ['super_admin']);
  grantAdminStepUp(mockDb);
  return user;
}

const input = {
  code: 'api.access',
  name: 'Service access',
  description: 'Read service data',
};

describe('permission endpoints', () => {
  it('uses admin CSRF and quoted versions for edit and tombstone deletion', async () => {
    admin();
    const definition = await createApplicationPermission('admin', 'app/one', input);
    const updated = await updateApplicationPermission('admin', 'app/one', definition, {
      name: 'Custom',
      description: 'Renamed',
      status: 'disabled',
    });
    expect(updated).toMatchObject({
      code: 'api.access',
      name: 'Custom',
      status: 'disabled',
      version: 2,
    });
    await expect(deleteApplicationPermission('admin', 'app/one', definition)).rejects.toMatchObject(
      { status: 412 },
    );
    await deleteApplicationPermission('admin', 'app/one', updated);
    expect((await listApplicationPermissions('admin', 'app/one')).items[0]?.status).toBe('deleted');
    await expect(createApplicationPermission('admin', 'app/one', input)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('initializes fourteen GuEarth definitions idempotently without granting access', async () => {
    admin();
    await initializeGuEarthPermissions('guearth');
    await initializeGuEarthPermissions('guearth');
    const result = await listApplicationPermissions('admin', 'guearth');
    expect(result.items).toHaveLength(14);
    expect(result.items.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'wolfx.cwa_eew.read',
        'maps.esri-imagery.read',
        'maps.viirs-night.read',
      ]),
    );
    expect(result.items.every((item) => item.grant_count === 0)).toBe(true);
    expect(mockDb.permissionGrants.size).toBe(0);
  });

  it('requires the developer role to list owned applications', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    seedDeveloperResource(mockDb, { owner_user_id: user.id });
    await expect(listDeveloperApplications()).rejects.toMatchObject({ status: 403 });
  });

  it('uses only account session and CSRF for owned developer applications', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    grantStepUp(mockDb);
    grantAccountRole(mockDb, user.id, ['developer']);
    seedDeveloperResource(mockDb, {
      id: 'owned',
      kind: 'application',
      display_name: 'Owned',
      status: 'active',
      owner_user_id: user.id,
    });
    seedDeveloperResource(mockDb, {
      id: 'other',
      kind: 'application',
      display_name: 'Other',
      status: 'active',
      owner_user_id: 'another',
    });
    expect((await listDeveloperApplications()).items.map((item) => item.id)).toEqual(['owned']);
    const definition = await createApplicationPermission('account', 'owned', input);
    await updateApplicationPermission('account', 'owned', definition, {
      name: 'Renamed',
      description: '',
      status: 'active',
    });
    expect(mockDb.adminSession).toBeNull();
    await expect(listApplicationPermissions('account', 'other')).rejects.toMatchObject({
      status: 404,
    });
    await expect(createApplicationPermission('account', 'other', input)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getPermissionGrants('someone')).rejects.toMatchObject({ status: 401 });
  });

  it('atomically updates roles and direct grants with the returned ETag', async () => {
    admin();
    const definition = await createApplicationPermission('admin', 'app', input);
    const current = await getPermissionGrants('target');
    const result = await putPermissionGrants(
      'target',
      {
        roles: ['user_admin'],
        builtin_permission_ids: [],
        application_permission_ids: [definition.id],
      },
      current.meta.etag!,
    );
    expect(result.roles).toEqual(['user_admin']);
    expect(result.application_grants).toEqual([{ ...definition, grant_count: 1 }]);
    expect(result.effective_capabilities).toContain('users:read');
    await expect(
      putPermissionGrants(
        'target',
        { roles: [], builtin_permission_ids: [], application_permission_ids: [] },
        current.meta.etag!,
      ),
    ).rejects.toMatchObject({ status: 412 });
  });

  it('拒绝自授权及非超级管理员修改权限', async () => {
    const user = admin();
    const body = {
      roles: ['super_admin'],
      builtin_permission_ids: [],
      application_permission_ids: [],
    };
    await expect(putPermissionGrants(user.id, body, '"1"')).rejects.toMatchObject({ status: 403 });
    signInAdmin(mockDb, user, ['user_admin']);
    grantAdminStepUp(mockDb);
    await expect(putPermissionGrants('target', body, '"1"')).rejects.toMatchObject({ status: 403 });
  });

  it('counts unrevoked disabled grants and permits retention but not new disabled grants', async () => {
    admin();
    const definition = await createApplicationPermission('admin', 'app', input);
    const body = {
      roles: [],
      builtin_permission_ids: [],
      application_permission_ids: [definition.id],
    };
    await putPermissionGrants('target', body, '"1"');
    const disabled = await updateApplicationPermission('admin', 'app', definition, {
      name: input.name,
      description: input.description,
      status: 'disabled',
    });
    expect(disabled.grant_count).toBe(1);
    expect((await listApplicationPermissions('admin', 'app')).items[0]?.grant_count).toBe(1);
    const retained = await putPermissionGrants('target', body, '"2"');
    expect(retained.application_grants[0]?.status).toBe('disabled');
    await expect(putPermissionGrants('new-target', body, '"1"')).rejects.toMatchObject({
      status: 400,
    });
    await deleteApplicationPermission('admin', 'app', disabled);
    expect((await listApplicationPermissions('admin', 'app')).items[0]?.grant_count).toBe(0);
    await expect(putPermissionGrants('target', body, '"3"')).rejects.toMatchObject({ status: 400 });
  });

  it('requires actual developer verification even when the account preference is off', async () => {
    const user = seedUser(mockDb, { step_up_required: false });
    signIn(mockDb, user, 'pwd');
    mockDb.developerApplications.push({
      id: 'owned',
      display_name: 'Owned',
      status: 'active',
      owner_user_id: user.id,
    });
    await expect(createApplicationPermission('account', 'owned', input)).rejects.toMatchObject({
      status: 403,
      code: 'account_step_up_required',
    });
    grantStepUp(mockDb, -1000);
    await expect(createApplicationPermission('account', 'owned', input)).rejects.toMatchObject({
      status: 403,
      code: 'account_step_up_required',
    });
    grantStepUp(mockDb);
    expect((await createApplicationPermission('account', 'owned', input)).grant_count).toBe(0);
  });

  it('无需备注即可创建权限', async () => {
    admin();
    expect((await createApplicationPermission('admin', 'app', input)).grant_count).toBe(0);
  });

  it('requires step-up for sensitive writes', async () => {
    const user = seedUser(mockDb);
    signInAdmin(mockDb, user, ['super_admin']);
    await expect(createApplicationPermission('admin', 'app', input)).rejects.toMatchObject({
      status: 403,
    });
  });
});

const resourceInput = {
  application_id: 'app',
  name: 'GuEarth',
  audience: 'https://api.example.test',
  client_ids: ['oc_device'],
};

function switchAdmin(user: ReturnType<typeof seedUser>, roles: Parameters<typeof signInAdmin>[2]) {
  signInAdmin(mockDb, user, roles);
  grantAdminStepUp(mockDb);
}

describe('resource server endpoints', () => {
  it('autoapproves for a sole approver but requires explicit one-time redemption', async () => {
    admin();
    let resource = await createResourceServer(resourceInput);
    await expect(requestResourceServerActivation(resource, 'activate')).rejects.toMatchObject({
      status: 409,
    });
    const request = await requestResourceServerActivation(resource, 'issue_secret');
    expect(request.status).toBe('approved');
    expect(mockDb.adminSecretCounter).toBe(0);
    resource = await getResourceServer(resource.id);
    expect(resource.version).toBe(2);
    expect(resource.change_requests?.[0]).toMatchObject({
      base_version: 2,
      snapshot: { name: 'GuEarth', client_ids: ['oc_device'] },
    });
    const secret = await createResourceServerSecret(resource, request.id);
    expect(secret.credential_id).toBeTruthy();
    await expect(createResourceServerSecret(resource, request.id)).rejects.toMatchObject({
      status: 412,
    });
    resource = await getResourceServer(resource.id);
    expect(resource.version).toBe(3);
    expect(resource.change_requests?.[0]?.status).toBe('applied');
    await expect(createResourceServerSecret(resource, request.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(mockDb.adminSecretCounter).toBe(1);
    expect((await requestResourceServerActivation(resource, 'activate')).status).toBe('applied');
    resource = await getResourceServer(resource.id);
    expect(resource.status).toBe('active');
    const rotate = await requestResourceServerActivation(resource, 'rotate_secret');
    resource = await getResourceServer(resource.id);
    await createResourceServerSecret(resource, rotate.id);
    expect(mockDb.adminSecretCounter).toBe(2);
  });

  it('requires independent approval and original requester redemption without incrementing the approval version', async () => {
    const requester = admin();
    const approver = seedUser(mockDb, { id: 'approver', username: 'approver' });
    mockDb.adminRolesOf.set(approver.id, ['application_approver']);
    let resource = await createResourceServer(resourceInput);
    const request = await requestResourceServerActivation(resource, 'issue_secret');
    expect(request.status).toBe('pending');
    resource = await getResourceServer(resource.id);
    await expect(requestResourceServerActivation(resource, 'issue_secret')).rejects.toMatchObject({
      status: 409,
    });
    await expect(createResourceServerSecret(resource, request.id)).rejects.toMatchObject({
      status: 409,
    });
    const decision = {
      change_request_id: request.id,
      decision: 'approve' as const,
    };
    await expect(decideResourceServerApproval(resource, decision)).rejects.toMatchObject({
      status: 403,
    });
    switchAdmin(approver, ['application_approver', 'application_admin']);
    expect((await decideResourceServerApproval(resource, decision)).status).toBe('approved');
    expect((await getResourceServer(resource.id)).version).toBe(resource.version);
    await expect(createResourceServerSecret(resource, request.id)).rejects.toMatchObject({
      status: 403,
    });
    switchAdmin(requester, ['super_admin']);
    await createResourceServerSecret(resource, request.id);
    resource = await getResourceServer(resource.id);
    const activation = await requestResourceServerActivation(resource, 'activate');
    resource = await getResourceServer(resource.id);
    switchAdmin(approver, ['application_approver']);
    expect(
      (
        await decideResourceServerApproval(resource, {
          ...decision,
          change_request_id: activation.id,
        })
      ).status,
    ).toBe('applied');
    switchAdmin(requester, ['super_admin']);
    resource = await getResourceServer(resource.id);
    resource = await updateResourceServer(resource, {
      ...resourceInput,
      name: 'Updated',
      client_ids: ['oc_second'],
    });
    expect(resource.client_ids).toEqual(['oc_device']);
    const change = resource.change_requests?.find((item) => item.action === 'configuration');
    expect(change).toMatchObject({
      base_version: resource.version,
      snapshot: { name: 'Updated', client_ids: ['oc_second'] },
    });
    switchAdmin(approver, ['application_approver']);
    await decideResourceServerApproval(resource, { ...decision, change_request_id: change!.id });
    expect((await getResourceServer(resource.id)).client_ids).toEqual(['oc_second']);
  });

  it('rejects stale approved snapshots, mismatched actions and empty client bindings', async () => {
    admin();
    await expect(createResourceServer({ ...resourceInput, client_ids: [] })).rejects.toMatchObject({
      status: 400,
    });
    let resource = await createResourceServer(resourceInput);
    await expect(requestResourceServerActivation(resource, 'rotate_secret')).rejects.toMatchObject({
      status: 409,
    });
    const request = await requestResourceServerActivation(resource, 'issue_secret');
    resource = await getResourceServer(resource.id);
    const old = resource;
    resource = await updateResourceServer(resource, { ...resourceInput, name: 'New name' });
    await expect(createResourceServerSecret(old, request.id)).rejects.toMatchObject({
      status: 412,
    });
    await expect(createResourceServerSecret(resource, request.id)).rejects.toMatchObject({
      status: 409,
    });
    const next = await requestResourceServerActivation(resource, 'issue_secret');
    resource = await getResourceServer(resource.id);
    mockDb.resourceServers[0]!.change_requests!.find(
      (item) => item.id === next.id,
    )!.snapshot.audience = 'https://other.example.test';
    await expect(createResourceServerSecret(resource, next.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(mockDb.adminSecretCounter).toBe(0);
  });
});
