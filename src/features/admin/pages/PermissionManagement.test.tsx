import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { PermissionGrants } from '@/api/endpoints/permissions';
import {
  grantAdminStepUp,
  seedAdminResource,
  seedAdminUser,
  seedUser,
  signInAdmin,
} from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute, renderWithProviders } from '@/test/render';
import { ReasonModal } from '../components/ReasonModal';
import type { ResourceServer } from '@/api/endpoints/admin/resourceServers';

function login(roles: Parameters<typeof signInAdmin>[2] = ['super_admin']) {
  const user = seedUser(mockDb);
  signInAdmin(mockDb, user, roles);
  grantAdminStepUp(mockDb);
  return user;
}

function seedGrants(): PermissionGrants {
  seedAdminUser(mockDb, { id: 'target' });
  const builtin = mockDb.permissionDefinitions.find((item) => item.code === 'users:read')!;
  const grants: PermissionGrants = {
    version: 1,
    roles: ['user_admin'],
    builtin_grants: [builtin],
    application_grants: [],
    effective_capabilities: ['users:read', 'users:write'],
    role_capabilities: {},
  };
  mockDb.permissionGrants.set('target', grants);
  return grants;
}

async function reasonAndConfirm(
  user: ReturnType<typeof userEvent.setup>,
  reason: string,
  label = '确认',
) {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText(/^操作原因/), reason);
  await user.click(within(dialog).getByRole('button', { name: label }));
}

describe('sensitive reason validation', () => {
  it('counts trimmed Unicode code points and shows field errors on blur', async () => {
    const user = userEvent.setup();
    const submitted: string[] = [];
    renderWithProviders(
      <ReasonModal
        opened
        title="Reason"
        required
        minReasonLength={3}
        confirmLabel="Submit reason"
        onClose={() => {}}
        onSubmit={(reason) => submitted.push(reason)}
      />,
    );
    const input = screen.getByLabelText(/^操作原因/);
    const submit = screen.getByRole('button', { name: 'Submit reason' });
    const astral = String.fromCodePoint(0x10400);
    fireEvent.change(input, { target: { value: ` ${astral.repeat(2)} ` } });
    fireEvent.blur(input);
    expect(submit).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(input, { target: { value: ` ${astral.repeat(3)} ` } });
    await user.click(submit);
    expect(submitted).toEqual([astral.repeat(3)]);
    fireEvent.change(input, { target: { value: 'a'.repeat(1001) } });
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: 'a'.repeat(1000) } });
    expect(submit).toBeEnabled();
  });

  it('preserves one-character reasons for existing dialogs by default', () => {
    renderWithProviders(
      <ReasonModal
        opened
        title="Reason"
        required
        confirmLabel="Submit reason"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^操作原因/), { target: { value: 'a' } });
    expect(screen.getByRole('button', { name: 'Submit reason' })).toBeEnabled();
  });
});

describe('user permission management', () => {
  it('previews inherited capabilities and saves a direct-grant removal atomically', async () => {
    const user = userEvent.setup();
    login();
    seedGrants();
    renderRoute(['/admin/users/target/access']);
    const direct = await screen.findByRole('checkbox', { name: 'users:read' });
    expect(direct).toBeChecked();
    await user.click(direct);
    expect(screen.getByText('仍从角色继承的能力: users:read, users:write')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '核对并保存权限' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
    expect(
      within(dialog).getByText('保存后的平台有效能力: users:read, users:write'),
    ).toBeInTheDocument();
    await reasonAndConfirm(user, 'remove redundant direct access', '保存');
    await waitFor(() => expect(mockDb.permissionGrants.get('target')?.builtin_grants).toEqual([]));
    expect(mockDb.permissionGrants.get('target')?.roles).toEqual(['user_admin']);
  });

  it.each(['user_admin', 'self'] as const)('does not permit grant editing for %s', async (mode) => {
    const user = login(mode === 'self' ? ['super_admin'] : ['user_admin']);
    const grants = seedGrants();
    if (mode === 'self') {
      seedAdminUser(mockDb, { id: user.id });
      mockDb.permissionGrants.set(user.id, grants);
    }
    let catalogRequests = 0;
    if (mode === 'user_admin')
      server.use(
        http.get('*/admin/v1/permissions', () => {
          catalogRequests++;
          return new HttpResponse(null, { status: 403 });
        }),
      );
    renderRoute([`/admin/users/${mode === 'self' ? user.id : 'target'}/access`]);
    expect(await screen.findByRole('checkbox', { name: '超级管理员' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '核对并保存权限' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'users:read' })).toBeDisabled();
    expect(
      screen.queryByText('保存后的平台有效能力: users:read, users:write'),
    ).not.toBeInTheDocument();
    expect(catalogRequests).toBe(0);
    expect(screen.getByText('当前平台有效能力: users:read, users:write')).toBeInTheDocument();
  });

  it('allows restoring a baseline disabled grant but never adding a new disabled grant', async () => {
    const user = userEvent.setup();
    login();
    const grants = seedGrants();
    const builtin = mockDb.permissionDefinitions.find((item) => item.code === 'users:read')!;
    builtin.status = 'disabled';
    const retained = {
      ...builtin,
      id: 'retained',
      application_id: 'app',
      name: 'Retained',
      code: 'retained.read',
    };
    const unavailable = {
      ...retained,
      id: 'unavailable',
      name: 'Unavailable',
      code: 'unavailable.read',
    };
    mockDb.permissionDefinitions.push(retained, unavailable);
    grants.application_grants = [retained];
    renderRoute(['/admin/users/target/access']);
    const checkbox = await screen.findByRole('checkbox', { name: 'Retained' });
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Unavailable' })).toBeDisabled();
    expect(screen.getByText('保存后的平台有效能力: users:write')).toBeInTheDocument();
  });

  it('requires explicit refresh after a 412 instead of overwriting newer grants', async () => {
    const user = userEvent.setup();
    login();
    const grants = seedGrants();
    renderRoute(['/admin/users/target/access']);
    await user.click(await screen.findByRole('checkbox', { name: 'users:read' }));
    await user.click(screen.getByRole('button', { name: '核对并保存权限' }));
    grants.version = 2;
    await reasonAndConfirm(user, 'old version', '保存');
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('资源已被修改，请刷新后重试。')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: '刷新并重新核对' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'users:read' })).toBeChecked();
    expect(mockDb.permissionGrants.get('target')?.version).toBe(2);
  });

  it('links audit history with the target resource filter', async () => {
    const user = userEvent.setup();
    login();
    seedGrants();
    renderRoute(['/admin/users/target/access']);
    await user.click(
      await screen.findByRole('link', { name: '查看用户审计记录' }, { timeout: 5000 }),
    );
    expect(await screen.findByDisplayValue('target')).toBeInTheDocument();
  });
});

describe('application permission catalog', () => {
  it('creates, renames and deletes definitions without exposing mutable codes', async () => {
    const user = userEvent.setup();
    login(['application_admin']);
    seedAdminResource(mockDb, { id: 'app', display_name: 'GuEarth' });
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '新建权限' }));
    await user.type(screen.getByLabelText(/^权限代码/), 'api.access');
    await user.type(screen.getByLabelText(/^权限名称/), 'Service access');
    await user.type(screen.getByLabelText('描述', { exact: true }), 'Custom description');
    await reasonAndConfirm(user, 'create definition');
    await user.click(await screen.findByRole('button', { name: '编辑权限' }));
    expect(screen.getByLabelText(/^权限代码/)).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText(/^权限名称/), { target: { value: 'Custom name' } });
    await reasonAndConfirm(user, 'rename definition');
    expect(await screen.findByText('Custom name')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(await screen.findByText(/删除 api.access 并撤销关联授权/)).toBeInTheDocument();
    await reasonAndConfirm(user, 'delete definition');
    expect(await screen.findByText('已删除')).toBeInTheDocument();
    expect(
      mockDb.permissionDefinitions.find((item) => item.application_id === 'app'),
    ).toMatchObject({ code: 'api.access', name: 'Custom name', status: 'deleted' });
  });

  it('shows affected direct-grant counts when re-enabling or deleting without disclosing users', async () => {
    const user = userEvent.setup();
    login(['application_admin']);
    seedAdminResource(mockDb, { id: 'app' });
    const definition = {
      ...mockDb.permissionDefinitions[0]!,
      id: 'app-permission',
      application_id: 'app',
      name: 'Application read',
      code: 'app.read',
      status: 'disabled' as const,
    };
    mockDb.permissionDefinitions.push(definition);
    mockDb.permissionGrants.set('private-user', {
      version: 1,
      roles: [],
      builtin_grants: [],
      application_grants: [definition],
      role_capabilities: {},
      effective_capabilities: [],
    });
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '编辑权限' }));
    await user.click(screen.getByRole('combobox', { name: '状态' }));
    await user.click(screen.getByRole('option', { name: '有效' }));
    expect(
      await screen.findByText('受影响的直接授权：1 项（包含已停用的授权）。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('private-user')).not.toBeInTheDocument();
    await reasonAndConfirm(user, 'restore existing access');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(
      await screen.findByText('受影响的直接授权：1 项（包含已停用的授权）。'),
    ).toBeInTheDocument();
  });

  it('initializes the GuEarth preset only after confirmation and leaves grants empty', async () => {
    const user = userEvent.setup();
    login(['application_admin']);
    seedAdminResource(mockDb, { id: 'app' });
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '初始化 GuEarth 权限' }));
    expect(await screen.findByText(/共 14 项权限定义/)).toBeInTheDocument();
    expect(
      mockDb.permissionDefinitions.filter((item) => item.application_id === 'app'),
    ).toHaveLength(0);
    await reasonAndConfirm(user, 'initialize catalog');
    await waitFor(() =>
      expect(
        mockDb.permissionDefinitions.filter((item) => item.application_id === 'app'),
      ).toHaveLength(14),
    );
    expect(mockDb.permissionGrants.size).toBe(0);
  });

  it('opens existing administrator step-up on a protected write', async () => {
    const user = userEvent.setup();
    login(['application_admin']);
    mockDb.adminSession!.step_up_expires_at = null;
    seedAdminResource(mockDb, { id: 'app' });
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '初始化 GuEarth 权限' }));
    await reasonAndConfirm(user, 'requires verification');
    expect(await screen.findByText('管理员二次验证')).toBeInTheDocument();
    expect(
      mockDb.permissionDefinitions.filter((item) => item.application_id === 'app'),
    ).toHaveLength(0);
  });
});

function seedResource(overrides: Partial<ResourceServer> = {}) {
  seedAdminResource(mockDb, { id: 'app' });
  const resource: ResourceServer = {
    id: 'rs',
    application_id: 'app',
    name: 'Resource API',
    audience: 'https://api.example.test',
    status: 'draft',
    version: 1,
    client_ids: ['oc_device'],
    secret_set: false,
    ...overrides,
  };
  mockDb.resourceServers.push(resource);
  return resource;
}

describe('resource service management', () => {
  it('requires nonempty client IDs and a three-character reason before creating a service', async () => {
    const user = userEvent.setup();
    login();
    seedAdminResource(mockDb, { id: 'app' });
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '注册资源服务器' }));
    fireEvent.change(screen.getByLabelText(/^资源服务器名称/), { target: { value: 'API' } });
    fireEvent.change(screen.getByLabelText(/^服务受众标识/), {
      target: { value: 'https://api.example.test' },
    });
    fireEvent.change(screen.getByLabelText(/^操作原因/), { target: { value: 'valid reason' } });
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: '确认' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^允许的 OAuth 客户端 ID/), {
      target: { value: ', ,\n' },
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^允许的 OAuth 客户端 ID/), {
      target: { value: 'oc_device' },
    });
    fireEvent.change(screen.getByLabelText(/^操作原因/), { target: { value: 'ab' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^操作原因/), { target: { value: 'abc' } });
    expect(confirm).toBeEnabled();
    expect(mockDb.resourceServers).toHaveLength(0);
  });

  it('keeps own pending requests unapproved when the server requires another approver', async () => {
    const user = userEvent.setup();
    const account = login();
    mockDb.adminRolesOf.set('another', ['application_approver']);
    const resource = seedResource();
    resource.change_requests = [
      {
        id: 'change',
        action: 'issue_secret',
        status: 'pending',
        requested_by: account.id,
        reason: 'credential request',
        base_version: 1,
        snapshot: {
          name: resource.name,
          audience: resource.audience,
          client_ids: resource.client_ids,
        },
      },
    ];
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '批准' }, { timeout: 5000 }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/应由另一位审批人决定/)).toBeInTheDocument();
    expect(within(dialog).getByText('申请基准版本：1 · 当前版本：1')).toBeInTheDocument();
    await reasonAndConfirm(user, 'try own approval');
    await waitFor(() =>
      expect(
        within(dialog).getByText('当前操作不被允许，可能需要额外的身份验证。'),
      ).toBeInTheDocument(),
    );
    expect(resource.change_requests[0]?.status).toBe('pending');
    expect(mockDb.adminSecretCounter).toBe(0);
  });

  it('submits credential approval without revealing a secret and prevents duplicate pending actions', async () => {
    const user = userEvent.setup();
    login(['application_admin']);
    seedResource();
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '创建服务凭据' }));
    await reasonAndConfirm(user, 'request first credential');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockDb.resourceServers[0]?.change_requests?.[0]?.status).toBe('pending');
    expect(mockDb.adminSecretCounter).toBe(0);
    expect(screen.getByRole('button', { name: '创建服务凭据' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '编辑服务绑定' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '领取已批准的服务凭据' })).not.toBeInTheDocument();
  });

  it.each(['other-requester', 'stale-approved', 'stale-pending'] as const)(
    'does not redeem %s and exposes snapshot differences',
    async (mode) => {
      const account = login();
      const resource = seedResource();
      resource.change_requests = [
        {
          id: 'change',
          action: 'issue_secret',
          status: mode === 'stale-pending' ? 'pending' : 'approved',
          requested_by: mode === 'other-requester' ? 'another' : account.id,
          reason: 'review this request',
          base_version: mode === 'other-requester' ? 1 : 0,
          snapshot: {
            name: 'Proposed API',
            audience: 'https://proposed.example.test',
            client_ids: ['oc_new'],
          },
        },
      ];
      renderRoute(['/admin/applications/app/access']);
      expect(await screen.findByText('申请的配置')).toBeInTheDocument();
      expect(screen.getByText('Proposed API')).toBeInTheDocument();
      expect(screen.getByText('当前：Resource API')).toBeInTheDocument();
      expect(screen.getByText('oc_new')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '领取已批准的服务凭据' }),
      ).not.toBeInTheDocument();
      if (mode !== 'other-requester') expect(screen.getByText(/此申请已过期/)).toBeInTheDocument();
      if (mode === 'stale-pending')
        expect(screen.getByRole('button', { name: '批准' })).toBeDisabled();
    },
  );

  it('requires a fresh review after redemption receives 412', async () => {
    const user = userEvent.setup();
    const account = login();
    const resource = seedResource();
    resource.change_requests = [
      {
        id: 'change',
        action: 'issue_secret',
        status: 'approved',
        requested_by: account.id,
        reason: 'credential request',
        base_version: 1,
        snapshot: {
          name: resource.name,
          audience: resource.audience,
          client_ids: resource.client_ids,
        },
      },
    ];
    renderRoute(['/admin/applications/app/access']);
    await user.click(
      await screen.findByRole('button', { name: '领取已批准的服务凭据' }, { timeout: 5000 }),
    );
    resource.version++;
    await reasonAndConfirm(user, 'redeem stale approval');
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('资源已被修改，请刷新后重试。')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认' })).toBeDisabled();
    expect(mockDb.adminSecretCounter).toBe(0);
    await user.click(within(dialog).getByRole('button', { name: '刷新并重新核对' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '领取已批准的服务凭据' })).not.toBeInTheDocument();
  });

  it('requires refresh and a new review after a binding version conflict', async () => {
    const user = userEvent.setup();
    login(['application_admin']);
    seedAdminResource(mockDb, { id: 'app' });
    const resource = {
      id: 'rs',
      application_id: 'app',
      name: 'Resource API',
      audience: 'service',
      status: 'draft' as const,
      version: 1,
      client_ids: ['oc_device'],
      secret_set: false,
    };
    mockDb.resourceServers.push(resource);
    renderRoute(['/admin/applications/app/access']);
    await user.click(
      await screen.findByRole('button', { name: '编辑服务绑定' }, { timeout: 5000 }),
    );
    fireEvent.change(screen.getByLabelText(/^资源服务器名称/), {
      target: { value: 'Updated API' },
    });
    resource.version = 2;
    await reasonAndConfirm(user, 'stale edit');
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('资源已被修改，请刷新后重试。')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '确认' })).toBeDisabled();
    expect(resource.name).toBe('Resource API');
    await user.click(within(dialog).getByRole('button', { name: '刷新并重新核对' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '编辑服务绑定' }));
    expect(screen.getByLabelText(/^资源服务器名称/)).toHaveValue('Resource API');
  });

  it('keeps the one-time credential visible when background refresh fails', async () => {
    const user = userEvent.setup();
    login();
    seedAdminResource(mockDb, { id: 'app' });
    mockDb.resourceServers.push({
      id: 'rs',
      application_id: 'app',
      name: 'Resource API',
      audience: 'service',
      status: 'draft',
      version: 1,
      client_ids: [],
      secret_set: false,
    });
    server.use(
      http.get('*/admin/v1/resource-servers', () =>
        mockDb.adminSecretCounter
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ items: mockDb.resourceServers }),
      ),
      http.get('*/admin/v1/resource-servers/rs', () =>
        mockDb.adminSecretCounter
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json(mockDb.resourceServers[0]),
      ),
    );
    renderRoute(['/admin/applications/app/access']);
    await user.click(
      await screen.findByRole('button', { name: '创建服务凭据' }, { timeout: 5000 }),
    );
    await reasonAndConfirm(user, 'create before refresh');
    expect(mockDb.adminSecretCounter).toBe(0);
    await user.click(
      await screen.findByRole('button', { name: '领取已批准的服务凭据' }, { timeout: 5000 }),
    );
    await reasonAndConfirm(user, 'redeem before refresh');
    expect(await screen.findByDisplayValue('resource_secret_1')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getByDisplayValue('resource_secret_1')).toBeInTheDocument();
  });

  it('registers a draft service and reveals credentials once without query or mutation caching', async () => {
    const user = userEvent.setup();
    login();
    seedAdminResource(mockDb, { id: 'app' });
    const { queryClient } = renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '注册资源服务器' }));
    await user.type(screen.getByLabelText(/^资源服务器名称/), 'Resource API');
    await user.type(screen.getByLabelText(/^服务受众标识/), 'https://api.example.test');
    await user.type(screen.getByLabelText(/^允许的 OAuth 客户端 ID/), 'oc_one\noc_two');
    await reasonAndConfirm(user, 'register resource service');
    expect(await screen.findByRole('heading', { name: 'Resource API' })).toBeInTheDocument();
    expect(mockDb.resourceServers[0]).toMatchObject({
      status: 'draft',
      client_ids: ['oc_one', 'oc_two'],
    });
    await user.click(
      await screen.findByRole('button', { name: '创建服务凭据' }, { timeout: 5000 }),
    );
    await reasonAndConfirm(user, 'create credential');
    expect(mockDb.adminSecretCounter).toBe(0);
    await user.click(
      await screen.findByRole('button', { name: '领取已批准的服务凭据' }, { timeout: 5000 }),
    );
    await reasonAndConfirm(user, 'redeem credential');
    expect(await screen.findByDisplayValue('resource_secret_1')).toBeInTheDocument();
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((entry) => entry.state.data),
      ),
    ).not.toContain('resource_secret_1');
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((entry) => entry.state.data),
      ),
    ).not.toContain('resource_secret_1');
    expect(JSON.stringify(localStorage)).not.toContain('resource_secret_1');
    expect(JSON.stringify(sessionStorage)).not.toContain('resource_secret_1');
    await user.click(screen.getByRole('button', { name: '我已保存' }));
    await waitFor(() =>
      expect(screen.queryByDisplayValue('resource_secret_1')).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('button', { name: '轮换服务凭据' })).toBeInTheDocument();
  });

  it('allows an approver to decide a request but not edit bindings or reveal credentials', async () => {
    const user = userEvent.setup();
    login(['application_approver']);
    seedAdminResource(mockDb, { id: 'app' });
    mockDb.resourceServers.push({
      id: 'rs',
      application_id: 'app',
      name: 'Resource API',
      audience: 'service',
      status: 'draft',
      version: 1,
      client_ids: ['oc_device'],
      secret_set: true,
      change_requests: [
        {
          id: 'change',
          action: 'activate',
          status: 'pending',
          reason: 'release service',
          requested_by: 'other',
          base_version: 1,
          snapshot: { name: 'Resource API', audience: 'service', client_ids: ['oc_device'] },
        },
      ],
    });
    renderRoute(['/admin/applications/app/access']);
    await user.click(await screen.findByRole('button', { name: '批准' }, { timeout: 5000 }));
    await reasonAndConfirm(user, 'checked application ownership');
    await waitFor(() => expect(mockDb.resourceServers[0]?.status).toBe('active'));
    expect(screen.queryByRole('button', { name: '编辑服务绑定' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建服务凭据' })).not.toBeInTheDocument();
  });
});
