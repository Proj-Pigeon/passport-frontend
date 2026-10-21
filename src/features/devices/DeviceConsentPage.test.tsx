import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockDb, seedPasskey, seedUser, server, signIn } from '@/test/mocks/server';
import { envelope } from '@/test/mocks/handlers';
import { renderRoute } from '@/test/render';

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn(), createNewAbortSignal: vi.fn() },
}));
vi.mock('@simplewebauthn/browser', () => webauthn);
const approved = vi.fn();
const denied = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  webauthn.startAuthentication.mockResolvedValue({
    id: 'cred_1',
    rawId: 'cred_1',
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: 'YQ',
      authenticatorData: 'YQ',
      signature: 'YQ',
      userHandle: 'dXNyX3NlZWQ',
    },
  });
  server.use(
    http.get('*/v1/device-authorizations/:code', ({ params }) =>
      params['code'] === 'EXPIRED'
        ? envelope(404, 'not_found', 'Not found')
        : HttpResponse.json({
            client_id: 'client_gu',
            client_name: 'GuEarth',
            device_name: 'Work laptop',
            platform: 'windows',
            scopes: ['openid', 'profile', 'email'],
            expires_at: new Date(Date.now() + 600_000).toISOString(),
            logo_url: '/v1/applications/apl_gu/logo',
            developer_name: 'Nexaorion',
            developer_url: 'https://nexaorion.example',
          }),
    ),
    http.post('*/v1/device-authorizations/:code/approve', () => {
      approved();
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/v1/device-authorizations/:code/deny', () => {
      denied();
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/v1/sessions/current/step-up/password', async ({ request }) => {
      const body = (await request.json()) as { password: string };
      if (body.password !== 'CorrectPassword42!')
        return envelope(400, 'invalid_request', 'Incorrect password');
      if (mockDb.session) {
        mockDb.session.step_up_method = 'password';
        mockDb.session.step_up_expires_at = new Date(Date.now() + 600_000).toISOString();
      }
      return new HttpResponse(null, { status: 204 });
    }),
  );
});
function login(options: { step_up_required?: boolean; has_password?: boolean } = {}) {
  const account = seedUser(mockDb, options);
  signIn(mockDb, account, 'pwd');
  return account;
}

describe('DeviceConsentPage', () => {
  it('shows the application branding and denies without identity verification', async () => {
    login();
    renderRoute(['/device/confirm?user_code=BCDFGHJK']);
    expect(await screen.findByRole('heading', { name: '授权 GuEarth' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'GuEarth' })).toHaveAttribute(
      'src',
      '/v1/applications/apl_gu/logo',
    );
    const developer = screen.getByRole('link', { name: /Nexaorion/ });
    expect(developer).toHaveAttribute('href', 'https://nexaorion.example');
    expect(screen.getByText('该应用将会获得以下权限：')).toBeInTheDocument();
    expect(screen.getByText('Work laptop · windows')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(await screen.findByText('已拒绝登录，可以关闭此页面。')).toBeInTheDocument();
    expect(denied).toHaveBeenCalledOnce();
    expect(approved).not.toHaveBeenCalled();
  });
  it('reports an expired code with a way back to the entry page', async () => {
    login();
    renderRoute(['/device/confirm?user_code=EXPIRED']);
    expect(await screen.findByText(/代码无效、已过期或已使用/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '重新输入代码' })).toHaveAttribute('href', '/device');
  });
  it('asks for the code when the link has none', async () => {
    login();
    renderRoute(['/device/confirm']);
    expect(await screen.findByText('缺少设备代码')).toBeInTheDocument();
  });
  it('uses password verification and keeps a wrong password on the consent page', async () => {
    login();
    renderRoute(['/device/confirm?user_code=BCDFGHJK']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '批准登录' }));
    await user.type(await screen.findByLabelText(/^密码/, { selector: 'input' }), 'wrong');
    await user.click(screen.getByRole('button', { name: '验证密码' }));
    expect(await screen.findByText('密码错误，请重试。')).toBeInTheDocument();
    expect(approved).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/^密码/, { selector: 'input' }));
    await user.type(screen.getByLabelText(/^密码/, { selector: 'input' }), 'CorrectPassword42!');
    await user.click(screen.getByRole('button', { name: '验证密码' }));
    expect(await screen.findByText(/设备已授权/)).toBeInTheDocument();
    expect(approved).toHaveBeenCalledOnce();
  });
  it('requires risk confirmation when account verification is disabled', async () => {
    login({ step_up_required: false });
    renderRoute(['/device/confirm?user_code=BCDFGHJK']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '批准登录' }));
    await user.click(await screen.findByRole('button', { name: '继续操作' }));
    expect(await screen.findByText(/设备已授权/)).toBeInTheDocument();
  });
  it('guides a credential-free account to register a passkey', async () => {
    login({ has_password: false });
    renderRoute(['/device/confirm?user_code=BCDFGHJK']);
    await userEvent.click(await screen.findByRole('button', { name: '批准登录' }));
    expect(await screen.findByRole('link', { name: '前往安全设置' })).toHaveAttribute(
      'href',
      '/account/security',
    );
    expect(approved).not.toHaveBeenCalled();
  });
  it('offers passkey verification when one is registered', async () => {
    const account = login();
    seedPasskey(mockDb, { user_id: account.id, credential_id: 'cred_1' });
    renderRoute(['/device/confirm?user_code=BCDFGHJK']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '批准登录' }));
    await user.click(await screen.findByRole('button', { name: '使用通行密钥验证' }));
    await waitFor(() => expect(approved).toHaveBeenCalledOnce());
    expect(webauthn.startAuthentication).toHaveBeenCalledOnce();
  });
});
