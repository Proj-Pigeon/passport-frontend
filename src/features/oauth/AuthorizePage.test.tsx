import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockDb, seedInteraction, seedUser, server, signIn } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const topLevel = vi.hoisted(() => ({ openTopLevel: vi.fn() }));

vi.mock('@/lib/topLevelNavigation', () => ({ openTopLevel: topLevel.openTopLevel }));

function signInAlice() {
  signIn(
    mockDb,
    seedUser(mockDb, { username: 'alice', display_name: 'Alice', email: 'alice@example.com' }),
    'pwd',
  );
}

describe('AuthorizePage', () => {
  beforeEach(() => {
    topLevel.openTopLevel.mockReset();
  });

  it.each(['fetch', 'approve'] as const)(
    'handles login_required on %s without competing unauthorized navigation',
    async (stage) => {
      signInAlice();
      seedInteraction(mockDb);
      let requests = 0;
      const response = () => {
        requests++;
        return HttpResponse.json(
          {
            error: {
              code: 'login_required',
              message: 'Authenticate again to continue authorization.',
            },
            login_url: `${window.location.origin}/login?reauth=required&next=%2Fauthorize%3Finteraction%3Dint_1`,
          },
          { status: 403 },
        );
      };
      server.use(
        stage === 'fetch'
          ? http.get('*/oauth2/authorize/interactions/:interactionId', response)
          : http.post('*/oauth2/authorize/interactions/:interactionId/approve', response),
      );
      const { router } = renderRoute(['/authorize?interaction=int_1']);
      if (stage === 'approve')
        await userEvent.click(await screen.findByRole('button', { name: '允许' }));
      await screen.findByRole('heading', { name: '登录' });
      expect(router.state.location.pathname).toBe('/login');
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('reauth')).toBe('required');
      expect(params.get('next')).toBe('/authorize?interaction=int_1');
      expect(requests).toBe(1);
      expect(topLevel.openTopLevel).not.toHaveBeenCalled();
      expect(screen.queryByText('会话已过期，请重新登录')).not.toBeInTheDocument();
    },
  );

  it('keeps the standard unauthorized behavior for an ordinary 401', async () => {
    signInAlice();
    seedInteraction(mockDb);
    server.use(
      http.get('*/oauth2/authorize/interactions/:interactionId', () => {
        mockDb.session = null;
        mockDb.currentUserId = null;
        return HttpResponse.json({ error: { code: 'unauthorized' } }, { status: 401 });
      }),
    );
    const { router } = renderRoute(['/authorize?interaction=int_1']);
    await screen.findByRole('heading', { name: '登录' });
    expect(new URLSearchParams(router.state.location.search).has('reauth')).toBe(false);
  });

  it('shows the consent context for a signed-in user', async () => {
    signInAlice();
    seedInteraction(mockDb, {
      client_name: 'Note Studio',
      scopes: ['openid', 'profile', 'email'],
    });
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByRole('heading', { name: '授权 Note Studio' })).toBeInTheDocument();
    expect(screen.getByText('该应用将会获得以下权限：')).toBeInTheDocument();
    expect(screen.getByText('验证用户身份')).toBeInTheDocument();
    expect(screen.getByText('允许应用获取你的鸽巢通行证用户名等基本资料。')).toBeInTheDocument();
    expect(screen.getByText('读取邮箱地址')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '允许' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeEnabled();
  });

  it('shows the application branding when the client provides it', async () => {
    signInAlice();
    seedInteraction(mockDb, {
      client_name: 'Note Studio',
      logo_url: '/v1/applications/apl_mock/logo',
      developer_name: 'Nexaorion',
      developer_url: 'https://nexaorion.example',
    });
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByRole('heading', { name: '授权 Note Studio' })).toBeInTheDocument();
    const logo = screen.getByRole('img', { name: 'Note Studio' });
    expect(logo).toHaveAttribute('src', '/v1/applications/apl_mock/logo');
    const developer = screen.getByRole('link', { name: /Nexaorion/ });
    expect(developer).toHaveAttribute('href', 'https://nexaorion.example');
  });

  it('labels an unrecognized scope', async () => {
    signInAlice();
    seedInteraction(mockDb, { scopes: ['openid', 'admin'] });
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByText('验证用户身份')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('应用还请求了一项其他权限（admin）。')).toBeInTheDocument();
  });

  it('navigates top-level to the approve continue_url', async () => {
    signInAlice();
    const interaction = seedInteraction(mockDb);
    renderRoute([`/authorize?interaction=${interaction.id}`]);
    await userEvent.click(await screen.findByRole('button', { name: '允许' }));
    await waitFor(() => {
      expect(topLevel.openTopLevel).toHaveBeenCalledWith(interaction.approveUrl);
    });
  });

  it('navigates top-level to the deny continue_url', async () => {
    signInAlice();
    const interaction = seedInteraction(mockDb);
    renderRoute([`/authorize?interaction=${interaction.id}`]);
    await userEvent.click(await screen.findByRole('button', { name: '拒绝' }));
    await waitFor(() => {
      expect(topLevel.openTopLevel).toHaveBeenCalledWith(interaction.denyUrl);
    });
  });

  it('shows the unavailable state for an unknown interaction', async () => {
    signInAlice();
    renderRoute(['/authorize?interaction=int_missing']);
    expect(await screen.findByText('授权请求不可用')).toBeInTheDocument();
  });

  it('shows the handled state when the decision returns conflict', async () => {
    signInAlice();
    seedInteraction(mockDb);
    server.use(
      http.post('*/oauth2/authorize/interactions/:interactionId/approve', () =>
        HttpResponse.json(
          {
            error: {
              code: 'conflict',
              message: 'The authorization interaction has expired or was already completed.',
              request_id: 'req_mock_conflict',
            },
          },
          { status: 409, headers: { 'X-Request-ID': 'req_mock_conflict' } },
        ),
      ),
    );
    renderRoute(['/authorize?interaction=int_1']);
    await userEvent.click(await screen.findByRole('button', { name: '允许' }));
    expect(await screen.findByText('授权请求已处理')).toBeInTheDocument();
    expect(topLevel.openTopLevel).not.toHaveBeenCalled();
  });

  it('disables the decision buttons once the interaction expires', async () => {
    signInAlice();
    seedInteraction(mockDb, { expires_at: new Date(Date.now() - 1_000).toISOString() });
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByText('授权请求已过期')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '允许' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeDisabled();
  });

  it('shows the missing state without an interaction parameter', async () => {
    signInAlice();
    renderRoute(['/authorize']);
    expect(await screen.findByText('无法显示授权请求')).toBeInTheDocument();
  });

  it('signs out with a next parameter back to the authorize page', async () => {
    signInAlice();
    const interaction = seedInteraction(mockDb);
    const { router } = renderRoute([`/authorize?interaction=${interaction.id}`]);
    await userEvent.click(await screen.findByRole('button', { name: '切换账号' }));
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(decodeURIComponent(router.state.location.search)).toContain(
      `/authorize?interaction=${interaction.id}`,
    );
  });
});
