import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockDb, seedInteraction, seedUser, signIn } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

describe('FederationCompletePage', () => {
  it('returns a federated-only account to its original OAuth interaction after forced authentication', async () => {
    signIn(mockDb, seedUser(mockDb, { has_password: false }), 'federation');
    seedInteraction(mockDb);
    sessionStorage.setItem('passport.samlRequest', 'srq_1234567890abcdefghijklmnop');
    const { router } = renderRoute([
      '/federation/complete?result=success&next=%2Fauthorize%3Finteraction%3Dint_1',
    ]);
    expect(await screen.findByRole('button', { name: '允许' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/authorize');
    expect(router.state.location.search).toBe('?interaction=int_1');
    expect(sessionStorage.getItem('passport.samlRequest')).toBeNull();
  });
  it('initialises the session and lands on the overview after a login success', async () => {
    signIn(mockDb, seedUser(mockDb, { username: 'alice', display_name: 'Alice' }), 'federation');
    renderRoute(['/federation/complete?result=success']);

    expect(await screen.findByRole('heading', { name: '概览' })).toBeInTheDocument();
  });

  it('honours a safe next parameter on login success', async () => {
    signIn(mockDb, seedUser(mockDb), 'federation');
    renderRoute(['/federation/complete?result=success&next=%2Faccount%2Fprofile']);

    expect(await screen.findByRole('heading', { name: '个人资料' })).toBeInTheDocument();
  });

  it('shows the failure page when the session cookie is missing', async () => {
    seedUser(mockDb);
    renderRoute(['/federation/complete?result=success']);

    expect(await screen.findByRole('heading', { name: '未能完成' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回登录' })).toBeInTheDocument();
  });

  it('refreshes the profile and returns to it after a link success', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    renderRoute(['/federation/complete?result=link_success']);

    expect(await screen.findByRole('heading', { name: '个人资料' })).toBeInTheDocument();
    expect(await screen.findByText('第三方账号绑定成功')).toBeInTheDocument();
  });

  it('shows the failure page for an unknown result', async () => {
    renderRoute(['/federation/complete?result=denied']);

    expect(await screen.findByRole('heading', { name: '未能完成' })).toBeInTheDocument();
  });

  it('shows the failure page when the result is missing', async () => {
    renderRoute(['/federation/complete']);

    expect(await screen.findByRole('heading', { name: '未能完成' })).toBeInTheDocument();
  });
});
