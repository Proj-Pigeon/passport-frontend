import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { grantAdminRole, seedUser, signInAdmin } from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const PASSWORD = 'correct-horse-battery';

function seedAdminAccount() {
  const user = seedUser(mockDb, { password: PASSWORD });
  grantAdminRole(mockDb, user.id, ['super_admin']);
  return user;
}

describe('admin guards', () => {
  it('redirects an anonymous visitor from /admin to the admin login', async () => {
    const { router } = renderRoute(['/admin']);

    expect(await screen.findByRole('heading', { name: '管理员登录' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/login');
    expect(router.state.location.search).toContain('next=');
  });

  it('redirects an authenticated admin away from /admin/login', async () => {
    signInAdmin(mockDb, seedAdminAccount(), ['super_admin']);

    renderRoute(['/admin/login']);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('signs an administrator in with a password', async () => {
    seedAdminAccount();
    const user = userEvent.setup();

    renderRoute(['/admin/login']);
    await user.type(await screen.findByLabelText(/^用户名或邮箱/), 'alice');
    await user.type(screen.getByLabelText(/^密码/), PASSWORD);
    await user.click(screen.getByRole('button', { name: '登录管理控制台' }));

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('rejects a password login without administrator roles', async () => {
    seedUser(mockDb, { password: PASSWORD });
    const user = userEvent.setup();

    renderRoute(['/admin/login']);
    await user.type(await screen.findByLabelText(/^用户名或邮箱/), 'alice');
    await user.type(screen.getByLabelText(/^密码/), PASSWORD);
    await user.click(screen.getByRole('button', { name: '登录管理控制台' }));

    expect(
      await screen.findByText('当前操作不被允许，可能需要额外的身份验证。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '概览' })).not.toBeInTheDocument();
  });

  it('rejects a wrong password', async () => {
    seedAdminAccount();
    const user = userEvent.setup();

    renderRoute(['/admin/login']);
    await user.type(await screen.findByLabelText(/^用户名或邮箱/), 'alice');
    await user.type(screen.getByLabelText(/^密码/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登录管理控制台' }));

    expect(await screen.findByText('登录失败，请检查管理员账号与密码。')).toBeInTheDocument();
  });
});
