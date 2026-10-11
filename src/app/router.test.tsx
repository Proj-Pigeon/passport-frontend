import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  renderWithProviders(<RouterProvider router={router} />);
  return router;
}

describe('router skeleton', () => {
  it('redirects / to /account', async () => {
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: '账号概览' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/account');
  });

  it.each([
    ['/login', '登录'],
    ['/register', '注册'],
    ['/forgot-password', '忘记密码'],
    ['/reset-password', '重置密码'],
    ['/verify-email', '邮箱验证'],
    ['/federation/complete?result=success', '第三方登录结果'],
    ['/authorize?interaction=abc', '授权同意'],
    ['/account/profile', '个人资料'],
    ['/account/security', '安全'],
    ['/account/connections', '连接账号'],
  ])('renders placeholder for %s', async (path, title) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('renders 404 for unknown paths', async () => {
    renderAt('/does-not-exist');
    expect(await screen.findByText('页面不存在')).toBeInTheDocument();
  });
});
