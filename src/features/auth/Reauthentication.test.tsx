import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { mockDb, seedInteraction, seedUser, signIn, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const webauthn = vi.hoisted(() => ({
  isWebAuthnSupported: vi.fn(() => true),
  isPasskeyCancelled: vi.fn(() => false),
  loginWithPasskey: vi.fn(async (_versions: Record<string, number>) => undefined),
}));
vi.mock('@/lib/webauthn', () => webauthn);

describe('OAuth reauthentication login', () => {
  it.each(['password', 'passkey'] as const)(
    'allows fresh %s login with an existing cached session',
    async (method) => {
      const user = userEvent.setup();
      server.use(
        http.get('*/v1/federation/providers', () => {
          return HttpResponse.json({
            providers: [{ slug: 'example', display_name: 'Example IdP', provider_type: 'oidc' }],
          });
        }),
      );
      signIn(
        mockDb,
        seedUser(mockDb, { username: 'alice', password: 'correct-horse-battery' }),
        'pwd',
      );
      seedInteraction(mockDb);
      const { router } = renderRoute(['/authorize?interaction=int_1']);
      await screen.findByRole('button', { name: '允许' });
      await router.navigate('/login?reauth=required&next=%2Fauthorize%3Finteraction%3Dint_1');
      expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
      await user.click(await screen.findByRole('checkbox'));
      const provider = await screen.findByRole('link', { name: '使用 Example IdP 继续' });
      expect(
        new URL(provider.getAttribute('href')!, window.location.origin).searchParams.get('reauth'),
      ).toBe('required');
      if (method === 'password') {
        await user.type(screen.getByLabelText(/^用户名或邮箱/), 'alice');
        await user.type(screen.getByLabelText(/^密码/), 'correct-horse-battery');
        await user.click(screen.getByRole('button', { name: '登录' }));
      } else {
        await user.click(screen.getByRole('button', { name: '使用通行密钥登录' }));
        expect(webauthn.loginWithPasskey).toHaveBeenCalledWith({ terms: 1, privacy: 1 });
      }
      await screen.findByRole('button', { name: '允许' });
      await waitFor(() => expect(router.state.location.pathname).toBe('/authorize'));
      expect(router.state.location.search).toBe('?interaction=int_1');
    },
  );

  it('still redirects an authenticated ordinary login to the account page', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const { router } = renderRoute(['/login']);
    await screen.findByRole('heading', { name: '概览' });
    expect(router.state.location.pathname).toBe('/account');
  });
});
