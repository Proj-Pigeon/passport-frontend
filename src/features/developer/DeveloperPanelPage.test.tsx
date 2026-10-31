import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import {
  grantAccountRole,
  grantStepUp,
  seedUser,
  signIn,
  seedDeveloperResource,
} from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function login() {
  const user = seedUser(mockDb);
  signIn(mockDb, user, 'pwd');
  grantStepUp(mockDb);
  grantAccountRole(mockDb, user.id, ['developer']);
  mockDb.developerApplications.push({
    id: 'owned',
    display_name: 'Owned application',
    status: 'active',
    owner_user_id: user.id,
  });
  const application = seedDeveloperResource(mockDb, {
    id: 'apl_panel',
    kind: 'application',
    display_name: 'Panel application',
    status: 'draft',
    configuration: { application_type: 'web', display_name: 'Panel application' },
    owner_user_id: user.id,
  });
  seedDeveloperResource(mockDb, {
    id: 'apl_other',
    kind: 'application',
    display_name: 'Other application',
    status: 'active',
    configuration: { application_type: 'web', display_name: 'Other application' },
    owner_user_id: 'someone-else',
  });
  return { user, application };
}

afterEach(() => server.events.removeAllListeners('request:start'));

describe('developer panel', () => {
  it('shows the panel overview with stats and the owned application list', async () => {
    login();
    renderRoute(['/account/developer']);
    expect(await screen.findByRole('heading', { name: '开发者面板' })).toBeInTheDocument();
    expect(await screen.findByText('Panel application')).toBeInTheDocument();
    expect(await screen.findByText('应用数量')).toBeInTheDocument();
    expect(await screen.findByText('使用人数')).toBeInTheDocument();
    expect(await screen.findByText('活跃人数')).toBeInTheDocument();
    expect(screen.queryByText('Other application')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByText('服务端 Web 应用 · OIDC'),
    ).toBeInTheDocument();
  });

  it('keeps creation available beside search when the application list is empty', async () => {
    login();
    const user = userEvent.setup();
    renderRoute(['/account/developer']);
    await screen.findByText('Panel application');
    await user.type(screen.getByPlaceholderText('搜索…'), 'missing application');
    await waitFor(() => expect(screen.queryByText('Panel application')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '我的应用' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建应用' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows an unclassified badge for legacy applications without an application type', async () => {
    const { application } = login();
    delete application.configuration['application_type'];
    renderRoute(['/account/developer']);
    expect(await screen.findByText('Panel application')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('未分类')).toBeInTheDocument();
    expect(screen.queryByText('页面出错了')).not.toBeInTheDocument();
  });

  it('hides the sidebar entry for users without the developer role', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    grantStepUp(mockDb);
    renderRoute(['/account']);
    await screen.findByRole('heading', { name: /概览|Overview/ });
    expect(screen.queryByRole('link', { name: '开发者面板' })).not.toBeInTheDocument();
  });

  it('shows the sidebar entry for developers and keeps it out of the avatar menu', async () => {
    login();
    const user = userEvent.setup();
    renderRoute(['/account']);
    expect(await screen.findByRole('link', { name: '开发者面板' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.queryByRole('menuitem', { name: '开发者面板' })).not.toBeInTheDocument();
  });

  it('creates an application draft through the create modal', async () => {
    const user = userEvent.setup();
    login();
    renderRoute(['/account/developer']);
    await user.click(await screen.findByRole('button', { name: '创建应用' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/应用名称/), 'Created app');
    expect(within(dialog).queryByLabelText(/回调地址/)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/操作原因/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
    expect(await screen.findByRole('heading', { name: 'Created app' })).toBeInTheDocument();
    expect(
      mockDb.developerResources.some(
        (item) => item.kind === 'application' && item.display_name === 'Created app',
      ),
    ).toBe(true);
  });

  it('shows the application detail page with admin-style tabs', async () => {
    login();
    renderRoute(['/account/developer/applications/apl_panel']);
    expect(await screen.findByRole('heading', { name: 'Panel application' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '概览' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '接入配置' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '权限与服务' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '变更与发布' })).toBeInTheDocument();
    expect(screen.getByText('apl_panel')).toBeInTheDocument();
  });

  it('rejects another owner application with a not-found error', async () => {
    login();
    renderRoute(['/account/developer/applications/apl_other']);
    expect(await screen.findAllByText(/加载失败/)).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: '激活' })).not.toBeInTheDocument();
  });

  it('activates an owned application immediately without a note or approval', async () => {
    const user = userEvent.setup();
    login();
    renderRoute(['/account/developer/applications/apl_panel']);
    await user.click(await screen.findByRole('button', { name: '激活' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/操作原因/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '提交' }));
    expect(await screen.findByText('状态变更已生效。')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockDb.developerResources.find((item) => item.id === 'apl_panel')?.status).toBe(
        'active',
      ),
    );
    expect(screen.queryByRole('button', { name: '批准' })).not.toBeInTheDocument();
  });

  it('supports the permission catalog on the access tab with account step-up', async () => {
    const user = userEvent.setup();
    login().user.step_up_required = true;
    mockDb.session!.step_up_expires_at = undefined;
    renderRoute(['/account/developer/applications/apl_panel/access']);
    await user.click(await screen.findByRole('button', { name: '新建权限' }));
    await user.type(screen.getByLabelText(/^权限代码/), 'custom.read');
    await user.type(screen.getByLabelText(/^权限名称/), 'Read custom data');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    expect(mockDb.permissionDefinitions.some((item) => item.code === 'custom.read')).toBe(false);
  });

  it('creates a permission after cached verification without administrator requests', async () => {
    const user = userEvent.setup();
    const { user: account } = login();
    account.step_up_required = false;
    const adminRequests: string[] = [];
    server.use(
      http.all('*/admin/v1/*', ({ request }) => {
        adminRequests.push(request.url);
        return new HttpResponse(null, { status: 500 });
      }),
    );
    renderRoute(['/account/developer/applications/apl_panel/access']);
    await user.click(await screen.findByRole('button', { name: '新建权限' }));
    await user.type(screen.getByLabelText(/^权限代码/), 'custom.read');
    await user.type(screen.getByLabelText(/^权限名称/), 'Read custom data');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    expect(await screen.findByText('Read custom data')).toBeInTheDocument();
    expect(
      mockDb.permissionDefinitions.find((item) => item.code === 'custom.read')?.application_id,
    ).toBe('apl_panel');
    expect(screen.queryByRole('button', { name: '初始化 GuEarth 权限' })).not.toBeInTheDocument();
    expect(adminRequests).toEqual([]);
  });
});
