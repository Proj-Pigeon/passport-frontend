import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mockDb,
  seedEmailChangeToken,
  seedPasskey,
  seedUser,
  server,
  signIn,
  type MockUser,
} from '@/test/mocks/server';
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

async function openSecurityPage(account: MockUser) {
  signIn(mockDb, account, 'pwd');
  renderRoute(['/account/security']);
  await screen.findByRole('heading', { name: '安全' });
}

async function openPasswordDialog() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '修改密码' }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

async function fillPasswordForm(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  current: string,
  next: string,
  confirm = next,
) {
  await user.type(within(dialog).getByLabelText(/^当前密码/), current);
  await user.type(within(dialog).getByLabelText(/^新密码/), next);
  await user.type(within(dialog).getByLabelText(/^确认新密码/), confirm);
}

describe('SecurityPage password change', () => {
  it('opens a dialog with the current, new and confirmation fields', async () => {
    await openSecurityPage(seedUser(mockDb));
    const { dialog } = await openPasswordDialog();

    expect(within(dialog).getByLabelText(/^当前密码/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^新密码/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^确认新密码/)).toBeInTheDocument();
  });

  it('rejects a mismatched confirmation before submitting', async () => {
    const account = seedUser(mockDb);
    await openSecurityPage(account);
    const { user, dialog } = await openPasswordDialog();

    await fillPasswordForm(
      user,
      dialog,
      'correct-horse-battery',
      'brand-new-password-1',
      'brand-new-password-2',
    );
    await user.click(within(dialog).getByRole('button', { name: '保存新密码' }));

    expect(await within(dialog).findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(account.password).toBe('correct-horse-battery');
  });

  it('surfaces a wrong current password from the server', async () => {
    const account = seedUser(mockDb);
    await openSecurityPage(account);
    const { user, dialog } = await openPasswordDialog();

    await fillPasswordForm(user, dialog, 'wrong-password-000', 'brand-new-password-1');
    await user.click(within(dialog).getByRole('button', { name: '保存新密码' }));

    expect(await within(dialog).findByText('当前密码不正确。')).toBeInTheDocument();
    expect(account.password).toBe('correct-horse-battery');
  });

  it('updates the password and closes the dialog', async () => {
    const account = seedUser(mockDb);
    await openSecurityPage(account);
    const { user, dialog } = await openPasswordDialog();

    await fillPasswordForm(user, dialog, 'correct-horse-battery', 'brand-new-password-1');
    await user.click(within(dialog).getByRole('button', { name: '保存新密码' }));

    await waitFor(() => expect(account.password).toBe('brand-new-password-1'));
    expect(await screen.findByText('密码已更新')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('requires a passkey ceremony when one is registered', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id });
    renderRoute(['/account/security']);
    await screen.findByRole('heading', { name: '安全' });
    const { user, dialog } = await openPasswordDialog();

    await fillPasswordForm(user, dialog, 'correct-horse-battery', 'brand-new-password-1');
    await user.click(within(dialog).getByRole('button', { name: '保存新密码' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(account.password).toBe('brand-new-password-1'));
    expect(mockDb.session?.step_up_method).toBe('passkey');
  });

  it('keeps the dialog open when the passkey prompt is dismissed', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id });
    webauthn.startAuthentication.mockRejectedValue(
      new DOMException('dismissed', 'NotAllowedError'),
    );
    renderRoute(['/account/security']);
    await screen.findByRole('heading', { name: '安全' });
    const { user, dialog } = await openPasswordDialog();

    await fillPasswordForm(user, dialog, 'correct-horse-battery', 'brand-new-password-1');
    await user.click(within(dialog).getByRole('button', { name: '保存新密码' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(webauthn.startAuthentication).toHaveBeenCalled());
    expect(account.password).toBe('correct-horse-battery');
    expect(screen.getByText('安全验证')).toBeInTheDocument();
  });
});

describe('SecurityPage email change', () => {
  it('asks for the current password and records the pending address', async () => {
    const account = seedUser(mockDb);
    await openSecurityPage(account);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '修改邮箱' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^新邮箱地址/), 'new@example.com');
    await user.type(within(dialog).getByLabelText(/^当前密码/), 'correct-horse-battery');
    await user.click(within(dialog).getByRole('button', { name: '发送确认邮件' }));

    await waitFor(() => expect(account.pending_email).toBe('new@example.com'));
    expect(await screen.findByText(/确认邮件已发送至 new@example.com/)).toBeInTheDocument();
    expect(await screen.findByText(/待确认：new@example.com/)).toBeInTheDocument();
    expect(account.email).toBe('alice@example.com');
  });

  it('rejects a wrong current password', async () => {
    const account = seedUser(mockDb);
    await openSecurityPage(account);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '修改邮箱' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^新邮箱地址/), 'new@example.com');
    await user.type(within(dialog).getByLabelText(/^当前密码/), 'wrong-password-000');
    await user.click(within(dialog).getByRole('button', { name: '发送确认邮件' }));

    expect(await within(dialog).findByText('当前密码不正确。')).toBeInTheDocument();
    expect(account.pending_email).toBeUndefined();
  });

  it('verifies with a passkey instead of the password when one is registered', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id });
    renderRoute(['/account/security']);
    await screen.findByRole('heading', { name: '安全' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '修改邮箱' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/^当前密码/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^新邮箱地址/), 'new@example.com');
    await user.click(within(dialog).getByRole('button', { name: '发送确认邮件' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(account.pending_email).toBe('new@example.com'));
  });

  it('reports an address that belongs to another account', async () => {
    seedUser(mockDb, { id: 'usr_other', username: 'bob', email: 'taken@example.com' });
    const account = seedUser(mockDb, { id: 'usr_seed', email: 'alice@example.com' });
    await openSecurityPage(account);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '修改邮箱' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^新邮箱地址/), 'taken@example.com');
    await user.type(within(dialog).getByLabelText(/^当前密码/), 'correct-horse-battery');
    await user.click(within(dialog).getByRole('button', { name: '发送确认邮件' }));

    expect(await within(dialog).findByText('该邮箱已被其他账号使用。')).toBeInTheDocument();
  });

  it('confirms the new address from the emailed link', async () => {
    const account = seedUser(mockDb, { pending_email: 'new@example.com' });
    const token = seedEmailChangeToken(mockDb, account.id);

    renderRoute([`/confirm-email-change?token=${token}`]);

    expect(await screen.findByText('邮箱已更新')).toBeInTheDocument();
    expect(account.email).toBe('new@example.com');
    expect(account.pending_email).toBeUndefined();
  });

  it('reports an unusable confirmation link', async () => {
    seedUser(mockDb);
    server.use(
      http.post('*/v1/email-changes/confirm', () =>
        HttpResponse.json(
          { error: { code: 'invalid_request', message: 'invalid', request_id: 'req_test' } },
          { status: 400 },
        ),
      ),
    );

    renderRoute([`/confirm-email-change?token=${'y'.repeat(24)}`]);

    expect(await screen.findByText('链接无效或已过期')).toBeInTheDocument();
  });
});
