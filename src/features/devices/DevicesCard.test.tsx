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
import type { Device } from '@/api/endpoints/devices';

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
    expect(screen.getByText('应用')).toBeInTheDocument();
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
