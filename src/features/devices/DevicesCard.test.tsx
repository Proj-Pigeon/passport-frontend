import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import {
  mockDb,
  seedUser,
  signIn,
  signInAdmin,
  seedAdminUser,
  grantAdminStepUp,
  signOut,
  server,
} from '@/test/mocks/server';
import { renderRoute } from '@/test/render';
import type { AuthorizedApplication, Device } from '@/api/endpoints/devices';

function devices(): Device[] {
  return [
    {
      id: 'dev_laptop',
      kind: 'application',
      device_name: 'GuEarth laptop',
      platform: 'windows',
      client_name: 'GuEarth',
      scopes: ['openid', 'profile'],
      authorized_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      current: false,
    },
    {
      id: mockDb.session!.id,
      kind: 'browser',
      device_name: 'Current browser',
      platform: 'browser',
      scopes: [],
      authorized_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      current: true,
    },
  ];
}
describe('DevicesCard', () => {
  it('paginates a mixed list and revokes the current browser without step-up', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const items = devices();
    const revoke = vi.fn();
    server.use(
      http.get('*/v1/me/devices', ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.has('cursor')
            ? { items: [items[1]], next_cursor: null }
            : { items: [items[0]], next_cursor: 'opaque-cursor' },
        ),
      ),
      http.delete('*/v1/me/devices/:id', () => {
        revoke();
        signOut(mockDb);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderRoute(['/account/security']);
    const user = userEvent.setup();
    expect(await screen.findByText('GuEarth laptop')).toBeInTheDocument();
    expect(screen.getAllByText('应用').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('当前会话')).toBeInTheDocument();
    expect(screen.getByText('浏览器')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销并退出' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '撤销访问' }));
    await screen.findByRole('heading', { name: '登录' });
    expect(router.state.location.pathname).toBe('/login');
    expect(revoke).toHaveBeenCalledOnce();
  });
  it('confirms application revocation with account risk confirmation', async () => {
    signIn(mockDb, seedUser(mockDb, { step_up_required: false }), 'pwd');
    let items = devices().slice(0, 1);
    const revoke = vi.fn();
    server.use(
      http.get('*/v1/me/devices', () => HttpResponse.json({ items, next_cursor: null })),
      http.delete('*/v1/me/devices/:id', () => {
        revoke();
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute(['/account/security']);
    const user = userEvent.setup();
    await screen.findByText('GuEarth laptop');
    await user.click(screen.getByRole('button', { name: '撤销访问' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: '撤销访问' }),
    );
    await user.click(await screen.findByRole('button', { name: '继续操作' }));
    expect(await screen.findByText('暂无活动设备。')).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledOnce();
  });
  it('requires a reason for an administrator to revoke a user device', async () => {
    const admin = seedUser(mockDb);
    signInAdmin(mockDb, admin, ['user_admin']);
    grantAdminStepUp(mockDb);
    seedAdminUser(mockDb, { id: 'usr_device_owner', username: 'owner' });
    let items: Device[] = [
      {
        id: 'dev_admin_target',
        kind: 'application',
        device_name: 'Lost laptop',
        platform: 'windows',
        scopes: ['openid'],
        authorized_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        current: false,
      },
    ];
    const revoke = vi.fn();
    server.use(
      http.get('*/admin/v1/users/:id/devices', () =>
        HttpResponse.json({ items, next_cursor: null }),
      ),
      http.delete('*/admin/v1/users/:id/devices/:device', async ({ request }) => {
        revoke(await request.json());
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute(['/admin/users/usr_device_owner']);
    const user = userEvent.setup();
    await screen.findByText('Lost laptop');
    await user.click(screen.getByRole('button', { name: '撤销访问' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('button', { name: '撤销访问' })).toBeDisabled();
    await user.type(dialog.getByLabelText(/^操作原因/), 'Device lost');
    await user.click(dialog.getByRole('button', { name: '撤销访问' }));
    expect(await screen.findByText('暂无活动设备。')).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith({ reason: 'Device lost' });
  });
});

describe('AuthorizedAppsCard', () => {
  it('renders authorized applications, expands permission details and revokes after confirmation', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    let items: AuthorizedApplication[] = [
      {
        id: 'grt_pigeon_app',
        client_id: 'client_pigeon',
        client_name: '鸽巢通行证',
        scopes: ['openid', 'profile', 'email'],
        authorized_at: '2026-10-19T00:00:00Z',
        logo_url: '/v1/applications/apl_pigeon/logo',
        developer_name: '奈索星联',
        developer_url: 'https://nexaorion.example',
      },
    ];
    const revoke = vi.fn();
    server.use(
      http.get('*/v1/me/applications', () => HttpResponse.json({ items })),
      http.delete('*/v1/me/applications/:id', ({ params }) => {
        revoke(params['id']);
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderRoute(['/account/security']);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: '应用' })).toBeInTheDocument();
    expect(await screen.findByText('鸽巢通行证')).toBeInTheDocument();
    expect(screen.getByText('奈索星联')).toBeInTheDocument();
    expect(screen.getByText(/授权于/)).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /权限范围 \(3\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('允许应用确认当前登录的是你，并获取用于识别你的唯一标识。'),
    ).toBeInTheDocument();
    expect(screen.getByText('允许应用获取你的鸽巢通行证用户名等基本资料。')).toBeInTheDocument();
    expect(screen.getByText('允许应用获取你在鸽巢通行证中绑定的邮箱地址。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '撤销 鸽巢通行证 的授权' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        '你确定要撤销对 鸽巢通行证 的授权吗？撤销后，该应用将无法访问你的鸽巢通行证数据。',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '撤销授权' }));

    expect(await screen.findByText('暂无已授权的应用。')).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith('grt_pigeon_app');
  });
});
