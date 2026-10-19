import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDb, seedUser, seedPasskey, signIn, server } from '@/test/mocks/server';
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

describe('DevicePage', () => {
  it('preserves a complete device code through the login redirect', async () => {
    const { router } = renderRoute(['/device?user_code=BCDF-GHJK']);
    await screen.findByRole('heading', { name: '登录' });
    expect(router.state.location.search).toContain('next=%2Fdevice%3Fuser_code%3DBCDF-GHJK');
  });
  it('prefills metadata and denies without identity verification', async () => {
    login();
    renderRoute(['/device?user_code=BCDF-GHJK']);
    expect(await screen.findByText('GuEarth')).toBeInTheDocument();
    expect(screen.getByLabelText(/^设备代码/)).toHaveValue('BCDF-GHJK');
    await userEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(await screen.findByText('已拒绝登录，可以关闭此页面。')).toBeInTheDocument();
    expect(denied).toHaveBeenCalledOnce();
    expect(approved).not.toHaveBeenCalled();
  });
  it('accepts manually entered codes and reports an expired code', async () => {
    login();
    renderRoute(['/device']);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^设备代码/), 'expired');
    await user.click(screen.getByRole('button', { name: '查询代码' }));
    expect(await screen.findByText(/代码无效、已过期或已使用/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^设备代码/));
    await user.type(screen.getByLabelText(/^设备代码/), 'bcdf-ghjk');
    await user.click(screen.getByRole('button', { name: '查询代码' }));
    expect(await screen.findByText('GuEarth')).toBeInTheDocument();
  });
  it('uses password verification and keeps a wrong password on the device page', async () => {
    login();
    renderRoute(['/device?user_code=BCDF-GHJK']);
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
    renderRoute(['/device?user_code=BCDF-GHJK']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '批准登录' }));
    await user.click(await screen.findByRole('button', { name: '继续操作' }));
    expect(await screen.findByText(/设备已授权/)).toBeInTheDocument();
  });
  it('guides a credential-free account to register a passkey', async () => {
    login({ has_password: false });
    renderRoute(['/device?user_code=BCDF-GHJK']);
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
    renderRoute(['/device?user_code=BCDF-GHJK']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '批准登录' }));
    await user.click(await screen.findByRole('button', { name: '使用通行密钥验证' }));
    await waitFor(() => expect(approved).toHaveBeenCalledOnce());
    expect(webauthn.startAuthentication).toHaveBeenCalledOnce();
  });
});
