import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import {
  grantStepUp,
  mockDb,
  seedPasskey,
  seedUser,
  signIn,
  server,
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

function attestation(credentialId: string) {
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON: 'Y2xpZW50RGF0YQ', attestationObject: 'YXR0ZXN0T2JqZWN0' },
  };
}

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

async function openSecurityPage(user: MockUser) {
  signIn(mockDb, user, 'pwd');
  renderRoute(['/account/security']);
  await screen.findByRole('heading', { name: '安全' });
}

describe('SecurityPage passkey list', () => {
  it('shows the empty state when no passkey is registered', async () => {
    await openSecurityPage(seedUser(mockDb));

    expect(await screen.findByText('还没有通行密钥')).toBeInTheDocument();
    expect(screen.getByText(/指纹、面容或设备 PIN/)).toBeInTheDocument();
  });

  it('renders labels, timestamps and transport badges', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    seedPasskey(mockDb, {
      user_id: user.id,
      label: 'MacBook Pro',
      last_used_at: new Date().toISOString(),
      backup_eligible: true,
      backup_state: true,
      transports: ['internal', 'hybrid'],
    });
    renderRoute(['/account/security']);

    expect(await screen.findByText('MacBook Pro')).toBeInTheDocument();
    expect(screen.getByText(/创建于/)).toBeInTheDocument();
    expect(screen.getByText(/最近使用/)).toBeInTheDocument();
    expect(screen.getByText('已同步')).toBeInTheDocument();
    expect(screen.getByText('内置')).toBeInTheDocument();
    expect(screen.getByText('混合')).toBeInTheDocument();
  });

  it('falls back to a placeholder for an unnamed credential', async () => {
    const user = seedUser(mockDb);
    signIn(mockDb, user, 'pwd');
    seedPasskey(mockDb, { user_id: user.id, label: '  ' });
    renderRoute(['/account/security']);

    expect(await screen.findByText('未命名密钥')).toBeInTheDocument();
  });
});

describe('SecurityPage passkey registration', () => {
  it('registers the first passkey without asking for step-up', async () => {
    await openSecurityPage(seedUser(mockDb));
    webauthn.startRegistration.mockResolvedValue(attestation('cred_first'));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '添加第一个通行密钥' }));

    await waitFor(() => expect(mockDb.passkeys).toHaveLength(1));
    expect(await screen.findByText('通行密钥已添加')).toBeInTheDocument();
    expect(await screen.findByText('未命名密钥')).toBeInTheDocument();
    expect(webauthn.startAuthentication).not.toHaveBeenCalled();
  });

  it('asks for step-up before adding a second passkey', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id, label: 'MacBook', credential_id: 'cred_1' });
    webauthn.startRegistration.mockResolvedValue(attestation('cred_second'));
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '添加' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(mockDb.passkeys).toHaveLength(2));
    expect(await screen.findByText('通行密钥已添加')).toBeInTheDocument();
    expect(mockDb.session?.step_up_expires_at).toBeTruthy();
  });

  it('keeps the modal open when the browser prompt is dismissed', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id, label: 'MacBook' });
    webauthn.startAuthentication.mockRejectedValue(
      new DOMException('dismissed', 'NotAllowedError'),
    );
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '添加' }));
    await user.click(await screen.findByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(webauthn.startAuthentication).toHaveBeenCalled());
    expect(screen.getByText('安全验证')).toBeInTheDocument();
    expect(mockDb.passkeys).toHaveLength(1);
  });

  it('reports an authenticator that is already registered', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    grantStepUp(mockDb);
    seedPasskey(mockDb, {
      user_id: account.id,
      credential_id: 'cred_first',
      label: 'MacBook',
    });
    webauthn.startRegistration.mockResolvedValue(attestation('cred_first'));
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '添加' }));

    expect(await screen.findByText('该通行密钥已注册在本账号')).toBeInTheDocument();
    expect(mockDb.passkeys).toHaveLength(1);
  });

  it('disables registration when the browser cannot handle passkeys', async () => {
    webauthn.browserSupportsWebAuthn.mockReturnValue(false);
    await openSecurityPage(seedUser(mockDb));

    expect(await screen.findByRole('button', { name: '添加第一个通行密钥' })).toBeDisabled();
  });
});

describe('SecurityPage passkey maintenance', () => {
  it('preserves credential metadata when renaming returns a partial object', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    grantStepUp(mockDb);
    const passkey = seedPasskey(mockDb, { user_id: account.id, label: 'MacBook' });
    server.use(
      http.patch('*/v1/me/passkeys/:id', () =>
        HttpResponse.json({ id: passkey.id, label: 'ThinkPad' }),
      ),
    );
    renderRoute(['/account/security']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '重命名' }));
    const input = await screen.findByLabelText('名称');
    await user.clear(input);
    await user.type(input, 'ThinkPad');
    await user.click(screen.getByRole('button', { name: '保存名称' }));
    expect(await screen.findByText('ThinkPad')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '安全' })).toBeInTheDocument();
  });

  it('renames a credential inline while the step-up window is open', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    grantStepUp(mockDb);
    seedPasskey(mockDb, { user_id: account.id, label: 'MacBook' });
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '重命名' }));
    const input = await screen.findByLabelText('名称');
    await user.clear(input);
    await user.type(input, 'ThinkPad');
    await user.click(screen.getByRole('button', { name: '保存名称' }));

    await waitFor(() => expect(mockDb.passkeys[0]?.label).toBe('ThinkPad'));
    expect(await screen.findByText('ThinkPad')).toBeInTheDocument();
  });

  it('asks for step-up when renaming outside the window', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id, label: 'MacBook' });
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '重命名' }));
    const input = await screen.findByLabelText('名称');
    await user.clear(input);
    await user.type(input, '新名字');
    await user.click(screen.getByRole('button', { name: '保存名称' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(mockDb.passkeys[0]?.label).toBe('新名字'));
  });

  it('deletes a credential after confirmation', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    grantStepUp(mockDb);
    seedPasskey(mockDb, { user_id: account.id, label: 'OldKey' });
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '删除通行密钥' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/OldKey/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mockDb.passkeys).toHaveLength(0));
    expect(await screen.findByText('通行密钥已删除')).toBeInTheDocument();
    expect(await screen.findByText('还没有通行密钥')).toBeInTheDocument();
  });

  it('refuses to delete the only way to sign in', async () => {
    const account = seedUser(mockDb, { has_password: false });
    signIn(mockDb, account, 'pwd');
    grantStepUp(mockDb);
    seedPasskey(mockDb, { user_id: account.id, label: 'OnlyKey' });
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '删除通行密钥' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(await screen.findByText('这是你唯一的登录方式，无法删除')).toBeInTheDocument();
    expect(mockDb.passkeys).toHaveLength(1);
  });
});

describe('SecurityPage step-up preference', () => {
  it('is enabled by default', async () => {
    await openSecurityPage(seedUser(mockDb));

    const toggle = await screen.findByRole('switch', { name: '敏感操作验证' });
    expect(toggle).toBeChecked();
    expect(screen.getByText('已启用')).toBeInTheDocument();
  });

  it('asks for confirmation before disabling and persists the choice', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: '敏感操作验证' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/不再进行身份验证，操作可能存在风险/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '关闭验证' }));

    await waitFor(() => expect(account.step_up_required).toBe(false));
    expect(await screen.findByText('已禁用')).toBeInTheDocument();
  });

  it('keeps the preference enabled when the risk confirmation is cancelled', async () => {
    const account = seedUser(mockDb);
    signIn(mockDb, account, 'pwd');
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: '敏感操作验证' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    expect(account.step_up_required).toBe(true);
    expect(await screen.findByText('已启用')).toBeInTheDocument();
  });

  it('re-enables without confirmation', async () => {
    const account = seedUser(mockDb, { step_up_required: false });
    signIn(mockDb, account, 'pwd');
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('switch', { name: '敏感操作验证' }));

    await waitFor(() => expect(account.step_up_required).toBe(true));
    expect(await screen.findByText('已启用')).toBeInTheDocument();
  });

  it('skips passkey verification but warns before renaming when disabled', async () => {
    const account = seedUser(mockDb, { step_up_required: false });
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id, label: 'MacBook' });
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '重命名' }));
    const input = await screen.findByLabelText('名称');
    await user.clear(input);
    await user.type(input, '新名字');
    await user.click(screen.getByRole('button', { name: '保存名称' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/敏感操作验证已禁用/)).toBeInTheDocument();
    expect(screen.queryByText('安全验证')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '继续操作' }));

    await waitFor(() => expect(mockDb.passkeys[0]?.label).toBe('新名字'));
    expect(webauthn.startAuthentication).not.toHaveBeenCalled();
  });

  it('aborts the sensitive action when the risk warning is dismissed', async () => {
    const account = seedUser(mockDb, { step_up_required: false });
    signIn(mockDb, account, 'pwd');
    seedPasskey(mockDb, { user_id: account.id, label: 'MacBook' });
    renderRoute(['/account/security']);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '重命名' }));
    const input = await screen.findByLabelText('名称');
    await user.clear(input);
    await user.type(input, '新名字');
    await user.click(screen.getByRole('button', { name: '保存名称' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockDb.passkeys[0]?.label).toBe('MacBook');
    expect(webauthn.startAuthentication).not.toHaveBeenCalled();
  });
});
