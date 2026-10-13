import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { seedAdminUser, seedPasskey, seedUser, signInAdmin } from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn(), createNewAbortSignal: vi.fn() },
}));

vi.mock('@simplewebauthn/browser', () => webauthn);

const ASSERTION = {
  id: 'cred_1',
  rawId: 'cred_1',
  type: 'public-key',
  clientExtensionResults: {},
  response: {
    clientDataJSON: 'Y2xpZW50RGF0YQ',
    authenticatorData: 'YXV0aERhdGE',
    signature: 'c2lnbmF0dXJl',
    userHandle: 'dXNyX3NlZWQ',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  webauthn.browserSupportsWebAuthn.mockReturnValue(true);
  webauthn.startAuthentication.mockResolvedValue(ASSERTION);
});

function signInAs(roles: 'auditor' | 'user_admin') {
  const user = seedUser(mockDb);
  seedAdminUser(mockDb, { id: 'adu_1', username: 'bob' });
  signInAdmin(mockDb, user, [roles]);
  return user;
}

describe('admin users page', () => {
  it('lists users with cursor pagination', async () => {
    const user = userEvent.setup();
    signInAs('auditor');
    for (let index = 1; index <= 22; index += 1) {
      seedAdminUser(mockDb, { id: `adu_bulk_${index}`, username: `bulk${index}` });
    }

    renderRoute(['/admin/users']);

    expect(await screen.findByRole('heading', { name: '用户管理' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'bulk19' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'bulk20' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '下一页' }));

    expect(await screen.findByRole('link', { name: 'bulk22' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'bulk1' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '上一页' }));

    expect(await screen.findByRole('link', { name: 'bulk1' })).toBeInTheDocument();
  });

  it('hides write actions from a read-only administrator', async () => {
    signInAs('auditor');

    renderRoute(['/admin/users/adu_1']);

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '挂起用户' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '撤销全部会话' })).not.toBeInTheDocument();
  });

  it('prompts for passkey step-up when a write is rejected', async () => {
    const user = userEvent.setup();
    signInAs('user_admin');

    renderRoute(['/admin/users/adu_1']);

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '挂起用户' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^操作原因/), 'policy violation');
    await user.click(within(dialog).getByRole('button', { name: '挂起用户' }));

    expect(await screen.findByText('管理员二次验证')).toBeInTheDocument();
  });

  it('completes passkey step-up and retries the rejected write', async () => {
    const user = userEvent.setup();
    const admin = signInAs('user_admin');
    seedPasskey(mockDb, { user_id: admin.id });

    renderRoute(['/admin/users/adu_1']);

    expect(await screen.findByRole('heading', { name: 'Bob' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '挂起用户' }));

    const reasonDialog = await screen.findByRole('dialog');
    await user.type(within(reasonDialog).getByLabelText(/^操作原因/), 'policy violation');
    await user.click(within(reasonDialog).getByRole('button', { name: '挂起用户' }));

    expect(await screen.findByText('管理员二次验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '验证通行密钥' }));

    expect(await screen.findByRole('button', { name: '恢复用户' })).toBeInTheDocument();
    expect(screen.queryByText(/无法完成二次验证/)).not.toBeInTheDocument();
  });
});
