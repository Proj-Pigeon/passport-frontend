import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { grantStepUp, seedUser, signIn } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function login() {
  const user = seedUser(mockDb);
  signIn(mockDb, user, 'pwd');
  grantStepUp(mockDb);
  mockDb.developerApplications.push(
    { id: 'owned', display_name: 'Owned application', status: 'active', owner_user_id: user.id },
    {
      id: 'other',
      display_name: 'Other application',
      status: 'active',
      owner_user_id: 'someone-else',
    },
  );
  return user;
}

afterEach(() => server.events.removeAllListeners('request:start'));

describe('developer application permissions', () => {
  it.each([true, false])(
    'honors cached verification with preference %s without administrator requests',
    async (preference) => {
      const user = userEvent.setup();
      login().step_up_required = preference;
      const adminRequests: string[] = [];
      server.use(
        http.all('*/admin/v1/*', ({ request }) => {
          adminRequests.push(request.url);
          return new HttpResponse(null, { status: 500 });
        }),
      );
      renderRoute(['/account/developer']);
      expect(await screen.findByRole('heading', { name: 'Owned application' })).toBeInTheDocument();
      expect(screen.queryByText('Other application')).not.toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: '权限目录' }));
      await user.click(await screen.findByRole('button', { name: '新建权限' }));
      await user.type(screen.getByLabelText(/^权限代码/), 'custom.read');
      await user.type(screen.getByLabelText(/^权限名称/), 'Read custom data');
      await user.type(screen.getByLabelText(/^操作原因/), 'publish access definition');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' }));
      expect(await screen.findByText('Read custom data')).toBeInTheDocument();
      expect(
        mockDb.permissionDefinitions.find((item) => item.code === 'custom.read')?.application_id,
      ).toBe('owned');
      expect(screen.queryByRole('button', { name: '初始化 GuEarth 权限' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '核对并保存权限' })).not.toBeInTheDocument();
      expect(adminRequests).toEqual([]);
    },
  );

  it('does not fetch another owner application catalog from a direct URL', async () => {
    login();
    let requests = 0;
    server.use(
      http.get('*/v1/developer/applications/other/permissions', () => {
        requests++;
        return HttpResponse.json({ items: [] });
      }),
    );
    renderRoute(['/account/developer/other/permissions']);
    expect(await screen.findByText('此应用不在你的开发者账户范围内。')).toBeInTheDocument();
    expect(requests).toBe(0);
    expect(screen.queryByRole('button', { name: '新建权限' })).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'uses account step-up before a developer write with preference %s',
    async (preference) => {
      const user = userEvent.setup();
      login().step_up_required = preference;
      mockDb.session!.step_up_expires_at = undefined;
      renderRoute(['/account/developer/owned/permissions']);
      await user.click(await screen.findByRole('button', { name: '新建权限' }));
      await user.type(screen.getByLabelText(/^权限代码/), 'custom.read');
      await user.type(screen.getByLabelText(/^权限名称/), 'Custom');
      await user.type(screen.getByLabelText(/^操作原因/), 'verify first');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' }));
      expect(await screen.findByText('安全验证')).toBeInTheDocument();
      expect(mockDb.permissionDefinitions.some((item) => item.code === 'custom.read')).toBe(false);
    },
  );

  it('reverifies and retries once when the server verification expires despite a cached valid session', async () => {
    const user = userEvent.setup();
    const account = login();
    account.step_up_required = false;
    let writes = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith('/applications/owned/permissions'))
        writes++;
    });
    renderRoute(['/account/developer/owned/permissions']);
    await user.click(await screen.findByRole('button', { name: '新建权限' }));
    mockDb.session!.step_up_expires_at = new Date(Date.now() - 1000).toISOString();
    await user.type(screen.getByLabelText(/^权限代码/), 'retry.read');
    await user.type(screen.getByLabelText(/^权限名称/), 'Retry read');
    await user.type(screen.getByLabelText(/^操作原因/), 'expired verification');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认' }));
    const verification = await screen.findByRole('dialog', { name: '安全验证' });
    expect(writes).toBe(2);
    expect(screen.queryByText('敏感操作验证已禁用')).not.toBeInTheDocument();
    await user.type(
      within(verification).getByLabelText(/^密码/, { selector: 'input' }),
      account.password,
    );
    await user.click(within(verification).getByRole('button', { name: '验证密码' }));
    expect(await screen.findByText('Retry read')).toBeInTheDocument();
    expect(writes).toBe(3);
    expect(mockDb.permissionDefinitions.filter((item) => item.code === 'retry.read')).toHaveLength(
      1,
    );
  });

  it('shows a recoverable catalog error', async () => {
    const user = userEvent.setup();
    login();
    server.use(
      http.get(
        '*/v1/developer/applications/owned/permissions',
        () => new HttpResponse(null, { status: 503 }),
        { once: true },
      ),
    );
    renderRoute(['/account/developer/owned/permissions']);
    await user.click(await screen.findByRole('button', { name: '重试' }));
    expect(await screen.findByText('没有匹配的权限。')).toBeInTheDocument();
  });

  it('keeps ordinary developer navigation available and shows admin switch for direct capabilities', async () => {
    login();
    server.use(
      http.get('*/v1/sessions/current', () =>
        HttpResponse.json({
          session: mockDb.session,
          user: { ...mockDb.users[0], roles: [], capabilities: ['applications:read'] },
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute(['/account/developer']);
    await screen.findByRole('heading', { name: 'Owned application' });
    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: '切换管理员视图' })).toBeInTheDocument(),
    );
  });
});
