import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { seedAdminUser, seedUser, signInAdmin } from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function signInAs(role: 'super_admin' | 'application_admin' | 'key_admin') {
  const user = seedUser(mockDb);
  signInAdmin(mockDb, user, [role]);
}

describe('admin overview page', () => {
  it('shows metric cards and charts for a super admin', async () => {
    signInAs('super_admin');
    const today = new Date().toISOString();
    seedAdminUser(mockDb, { id: 'adu_1', created_at: today });
    seedAdminUser(mockDb, {
      id: 'adu_2',
      username: 'carol',
      created_at: today,
      status: 'suspended',
    });

    renderRoute(['/admin']);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
    expect(await screen.findByText('用户数量')).toBeInTheDocument();
    expect(screen.getByText('应用数量')).toBeInTheDocument();
    expect(screen.getByText('接口请求')).toBeInTheDocument();
    expect(screen.getByText('审计事件')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /近 30 天趋势/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '用户状态分布' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /近 30 天请求与审计/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '管理员会话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '二次验证状态' })).not.toBeInTheDocument();
  });

  it('hides metric sections the administrator cannot read', async () => {
    signInAs('key_admin');

    renderRoute(['/admin']);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
    expect(screen.queryByText('用户数量')).not.toBeInTheDocument();
    expect(screen.queryByText('应用数量')).not.toBeInTheDocument();
    expect(screen.queryByText('审计事件')).not.toBeInTheDocument();
  });

  it('shows only application metrics for an application admin', async () => {
    signInAs('application_admin');

    renderRoute(['/admin']);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
    expect(await screen.findByText('应用数量')).toBeInTheDocument();
    expect(screen.queryByText('用户数量')).not.toBeInTheDocument();
    expect(screen.queryByText('审计事件')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '用户状态分布' })).not.toBeInTheDocument();
  });
});
