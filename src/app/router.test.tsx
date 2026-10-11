import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { seedUser, signIn } from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function signInMockUser() {
  signIn(mockDb, seedUser(mockDb), 'pwd');
}

describe('routing', () => {
  it('redirects an anonymous visitor from / to /login', async () => {
    renderRoute(['/']);
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
  });

  it('renders the login page', async () => {
    renderRoute(['/login']);
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
  });

  it.each([
    ['/register', '创建账号'],
    ['/forgot-password', '找回密码'],
  ])('renders %s', async (path, heading) => {
    renderRoute([path]);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('shows the invalid-link state on /reset-password without a token', async () => {
    renderRoute(['/reset-password']);
    expect(await screen.findByRole('heading', { name: '链接无效或已过期' })).toBeInTheDocument();
  });

  it('shows the missing-token state on /verify-email', async () => {
    renderRoute(['/verify-email']);
    expect(await screen.findByText('缺少验证令牌')).toBeInTheDocument();
  });

  it('renders 404 for unknown paths', async () => {
    renderRoute(['/does-not-exist']);
    expect(await screen.findByText('页面不存在')).toBeInTheDocument();
  });
});

describe('authenticated routing', () => {
  it('redirects / to the account overview', async () => {
    signInMockUser();
    renderRoute(['/']);
    expect(await screen.findByRole('heading', { name: '账号概览' })).toBeInTheDocument();
  });

  it.each([
    ['/account/profile', '个人资料'],
    ['/account/security', '安全'],
  ])('renders %s inside the account layout', async (path, heading) => {
    signInMockUser();
    renderRoute([path]);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pigeon Passport' })).toBeInTheDocument();
  });

  it('redirects an authenticated visitor away from /login', async () => {
    signInMockUser();
    renderRoute(['/login?next=%2Faccount%2Fsecurity']);
    expect(await screen.findByRole('heading', { name: '安全' })).toBeInTheDocument();
  });

  it('sends an anonymous visitor from /authorize to the login page', async () => {
    renderRoute(['/authorize?interaction=int_1']);
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
  });

  it('preserves the intended destination when bouncing to /login', async () => {
    const { router } = renderRoute(['/account/security']);

    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Faccount%2Fsecurity');
  });
});
