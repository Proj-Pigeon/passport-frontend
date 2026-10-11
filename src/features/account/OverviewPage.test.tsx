import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  grantStepUp,
  mockDb,
  seedPasskey,
  seedUser,
  signIn,
  type MockUser,
} from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

async function openOverview(user: MockUser) {
  signIn(mockDb, user, 'pwd');
  renderRoute(['/account']);
  await screen.findByRole('heading', { name: '概览' });
}

describe('OverviewPage', () => {
  it('summarizes the signed-in identity', async () => {
    await openOverview(
      seedUser(mockDb, {
        username: 'alice',
        display_name: 'Alice',
        email: 'alice@example.com',
      }),
    );

    expect(await screen.findByText('@alice')).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('邮箱已验证')).toBeInTheDocument();
  });

  it('falls back to the username when no display name is set', async () => {
    await openOverview(seedUser(mockDb, { username: 'alice', display_name: '' }));

    expect(await screen.findByText('@alice')).toBeInTheDocument();
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0);
  });

  it('reports the sign-in method and the session deadline', async () => {
    await openOverview(seedUser(mockDb));

    expect(await screen.findByText('登录方式')).toBeInTheDocument();
    expect(screen.getByText('密码')).toBeInTheDocument();
    expect(screen.getByText('会话到期')).toBeInTheDocument();
    expect(screen.getAllByText(/\d{4}/).length).toBeGreaterThan(0);
  });

  it('flags an unverified mailbox and a non-active account', async () => {
    await openOverview(seedUser(mockDb, { email_verified: false, status: 'pending_verification' }));

    expect(await screen.findByText('邮箱未验证')).toBeInTheDocument();
    expect(screen.getByText('待验证')).toBeInTheDocument();
  });

  it('recommends a passkey when none is registered', async () => {
    await openOverview(seedUser(mockDb));

    expect(await screen.findByText('尚未添加')).toBeInTheDocument();
    expect(screen.getByText(/添加通行密钥后/)).toBeInTheDocument();
  });

  it('counts the registered passkeys', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    seedPasskey(mockDb, { user_id: user.id, credential_id: 'cred_1' });
    seedPasskey(mockDb, { user_id: user.id, credential_id: 'cred_2' });
    renderRoute(['/account']);
    await screen.findByRole('heading', { name: '概览' });

    expect(await screen.findByText('2 个')).toBeInTheDocument();
    expect(screen.queryByText(/添加通行密钥后/)).not.toBeInTheDocument();
  });

  it('shows the remaining time of an active step-up window', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    grantStepUp(mockDb);
    renderRoute(['/account']);
    await screen.findByRole('heading', { name: '概览' });

    expect(await screen.findByText('已验证')).toBeInTheDocument();
    expect(screen.getAllByText(/\d+:\d{2}/).length).toBeGreaterThan(0);
  });

  it('shows the inactive step-up state by default', async () => {
    await openOverview(seedUser(mockDb));

    expect(await screen.findByText('未验证')).toBeInTheDocument();
  });
});
