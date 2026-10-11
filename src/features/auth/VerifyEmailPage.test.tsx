import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { seedUser } from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const TOKEN = 'verify_token_that_is_long_enough';

function seedPendingUser() {
  const user = seedUser(mockDb, {
    id: 'usr_pending',
    username: 'alice',
    email: 'alice@example.com',
    email_verified: false,
    status: 'pending_verification',
  });
  mockDb.verificationTokens.set(TOKEN, user.id);
  return user;
}

describe('VerifyEmailPage', () => {
  it('confirms a token supplied in the query string', async () => {
    seedPendingUser();
    renderRoute([`/verify-email?token=${TOKEN}`]);

    expect(await screen.findByRole('heading', { name: '邮箱验证成功' })).toBeInTheDocument();
    expect(mockDb.users[0]?.email_verified).toBe(true);
    expect(mockDb.users[0]?.status).toBe('active');
  });

  it('confirms a token supplied in the fragment', async () => {
    seedPendingUser();
    renderRoute([`/verify-email#token=${TOKEN}`]);

    expect(await screen.findByRole('heading', { name: '邮箱验证成功' })).toBeInTheDocument();
    expect(mockDb.users[0]?.email_verified).toBe(true);
  });

  it('prefers the fragment over the query string', async () => {
    seedPendingUser();
    renderRoute([`/verify-email?token=short#token=${TOKEN}`]);

    expect(await screen.findByRole('heading', { name: '邮箱验证成功' })).toBeInTheDocument();
  });

  it('strips the token from the address bar', async () => {
    seedPendingUser();
    const { router } = renderRoute([`/verify-email?token=${TOKEN}`]);

    await screen.findByRole('heading', { name: '邮箱验证成功' });
    expect(router.state.location.search).toBe('');
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.pathname).toBe('/verify-email');
  });

  it('reports an unknown or expired token', async () => {
    seedPendingUser();
    renderRoute(['/verify-email?token=an_unknown_token_value_here']);

    expect(await screen.findByRole('heading', { name: '链接无效或已过期' })).toBeInTheDocument();
    expect(mockDb.users[0]?.email_verified).toBe(false);
  });

  it('reports a token shorter than the server minimum', async () => {
    seedPendingUser();
    renderRoute(['/verify-email?token=tooshort']);

    expect(await screen.findByRole('heading', { name: '链接无效或已过期' })).toBeInTheDocument();
  });

  it('consumes the token so it cannot be replayed', async () => {
    seedPendingUser();
    renderRoute([`/verify-email?token=${TOKEN}`]);
    await screen.findByRole('heading', { name: '邮箱验证成功' });

    expect(mockDb.verificationTokens.has(TOKEN)).toBe(false);
  });

  it('explains what to do when no token is present', async () => {
    renderRoute(['/verify-email']);

    expect(await screen.findByText('缺少验证令牌')).toBeInTheDocument();
  });

  it('links back to the login page after success', async () => {
    seedPendingUser();
    const user = userEvent.setup();
    renderRoute([`/verify-email?token=${TOKEN}`]);

    await user.click(await screen.findByRole('link', { name: '去登录' }));

    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
  });
});
