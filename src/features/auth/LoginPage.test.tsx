import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { seedUser, signIn } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const PASSWORD = 'correct-horse-battery';

async function openLoginPage(path = '/login') {
  renderRoute([path]);
  await screen.findByRole('heading', { name: '登录' });
}

async function submitCredentials(
  user: ReturnType<typeof userEvent.setup>,
  identifier: string,
  password: string,
) {
  await user.type(screen.getByLabelText(/^用户名或邮箱/), identifier);
  await user.type(screen.getByLabelText(/^密码/), password);
  await user.click(screen.getByRole('button', { name: '登录' }));
}

describe('LoginPage', () => {
  it('signs in and lands on the account overview', async () => {
    seedUser(mockDb, { username: 'alice', email: 'alice@example.com', password: PASSWORD });
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, 'alice', PASSWORD);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
    expect(mockDb.currentUserId).not.toBeNull();
  });

  it('accepts an email address as the identifier', async () => {
    seedUser(mockDb, { username: 'alice', email: 'alice@example.com', password: PASSWORD });
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, '  Alice@Example.com ', PASSWORD);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('honours the next parameter', async () => {
    seedUser(mockDb, { username: 'alice', email: 'alice@example.com', password: PASSWORD });
    const user = userEvent.setup();
    await openLoginPage('/login?next=%2Faccount%2Fsecurity');

    await submitCredentials(user, 'alice', PASSWORD);

    expect(await screen.findByRole('heading', { name: '安全' })).toBeInTheDocument();
  });

  it('ignores an off-site next parameter', async () => {
    seedUser(mockDb, { username: 'alice', email: 'alice@example.com', password: PASSWORD });
    const user = userEvent.setup();
    await openLoginPage('/login?next=%2F%2Fevil.example%2Faccount');

    await submitCredentials(user, 'alice', PASSWORD);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('shows one generic message for a wrong password', async () => {
    seedUser(mockDb, { username: 'alice', email: 'alice@example.com', password: PASSWORD });
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, 'alice', 'wrong-password-entirely');

    expect(await screen.findByText('账号或密码错误')).toBeInTheDocument();
    expect(screen.getByText(/我们不会提示具体原因/)).toBeInTheDocument();
    expect(mockDb.currentUserId).toBeNull();
  });

  it('shows the same generic message for an unknown account', async () => {
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, 'nobody', PASSWORD);

    expect(await screen.findByText('账号或密码错误')).toBeInTheDocument();
  });

  it('shows the same generic message for an unverified account', async () => {
    seedUser(mockDb, {
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
      email_verified: false,
      status: 'pending_verification',
    });
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, 'alice', PASSWORD);

    expect(await screen.findByText('账号或密码错误')).toBeInTheDocument();
    expect(screen.getByText(/我们不会提示具体原因/)).toBeInTheDocument();
  });

  it('blocks submission when the identifier is empty', async () => {
    let called = false;
    server.use(
      http.post('*/v1/sessions/password', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    await openLoginPage();

    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('请填写用户名或邮箱')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('arms the countdown on 429', async () => {
    server.use(
      http.post('*/v1/sessions/password', () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      ),
    );
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, 'alice', PASSWORD);

    const button = await screen.findByRole('button', { name: /尝试过于频繁/ });
    expect(button).toBeDisabled();
  });

  it('reports a 503 as a retryable outage', async () => {
    server.use(
      http.post('*/v1/sessions/password', () =>
        HttpResponse.json(
          { error: { code: 'dependency_unavailable', message: 'db down' } },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    await openLoginPage();

    await submitCredentials(user, 'alice', PASSWORD);

    expect(await screen.findByText('服务暂时不可用，请稍后重试。')).toBeInTheDocument();
  });

  it('redirects an already signed-in visitor to the account overview', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    renderRoute(['/login']);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('signs out from the account layout and returns to the login page', async () => {
    signIn(mockDb, seedUser(mockDb, { username: 'alice', display_name: 'Alice' }), 'pwd');
    const user = userEvent.setup();
    renderRoute(['/account']);
    await screen.findByRole('heading', { name: '概览' });

    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await user.click(await screen.findByRole('menuitem', { name: '退出登录' }));

    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(mockDb.currentUserId).toBeNull();
  });
});
