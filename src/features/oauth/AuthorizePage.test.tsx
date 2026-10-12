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

  it('shows the consent context for a signed-in user', async () => {
    signInAlice();
    seedInteraction(mockDb, {
      client_name: 'Note Studio',
      scopes: ['openid', 'profile', 'email'],
    });
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByText('Note Studio 请求获得以下权限：')).toBeInTheDocument();
    expect(screen.getByText('确认你的身份')).toBeInTheDocument();
    expect(screen.getByText('读取你的基本资料（用户名、昵称）')).toBeInTheDocument();
    expect(screen.getByText('读取你的邮箱地址')).toBeInTheDocument();
    expect(screen.getByText('当前账号')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '允许' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeEnabled();
  });

  it('labels an unrecognized scope', async () => {
    signInAlice();
    seedInteraction(mockDb, { scopes: ['openid', 'admin'] });
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByText('确认你的身份')).toBeInTheDocument();
    expect(screen.getByText('admin（未知权限）')).toBeInTheDocument();
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
