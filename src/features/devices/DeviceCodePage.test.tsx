import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockDb, seedUser, server, signIn } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

beforeEach(() => {
  server.use(
    http.get('*/v1/device-authorizations/:code', () =>
      HttpResponse.json({
        client_id: 'client_gu',
        client_name: 'GuEarth',
        device_name: 'Work laptop',
        platform: 'windows',
        scopes: ['openid', 'profile', 'email'],
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      }),
    ),
  );
});

function login() {
  const account = seedUser(mockDb, {});
  signIn(mockDb, account, 'pwd');
  return account;
}

describe('DeviceCodePage', () => {
  it('preserves a complete device code through the login redirect', async () => {
    const { router } = renderRoute(['/device?user_code=BCDF-GHJK']);
    await screen.findByRole('heading', { name: '登录' });
    expect(router.state.location.search).toContain('next=%2Fdevice%3Fuser_code%3DBCDF-GHJK');
  });

  it('forwards a complete code from the URL to the consent page', async () => {
    login();
    const { router } = renderRoute(['/device?user_code=BCDF-GHJK']);
    await waitFor(() => expect(router.state.location.pathname).toBe('/device/confirm'));
    expect(router.state.location.search).toContain('user_code=BCDFGHJK');
    expect(await screen.findByRole('heading', { name: '授权 GuEarth' })).toBeInTheDocument();
  });

  it('normalizes a manually entered code before continuing', async () => {
    login();
    const { router } = renderRoute(['/device']);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^设备代码/), 'bcdf ghjk');
    await user.click(screen.getByRole('button', { name: '继续' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/device/confirm'));
    expect(router.state.location.search).toContain('user_code=BCDFGHJK');
  });

  it('reports an incomplete code without leaving the entry page', async () => {
    login();
    const { router } = renderRoute(['/device']);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^设备代码/), 'BCDF');
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(
      await screen.findByText('代码格式不正确，应为 8 位字符（如 ABCD-EFGH）。'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/device');
  });
});
