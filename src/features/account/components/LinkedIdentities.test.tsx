import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  grantStepUp,
  mockDb,
  seedLinkedExternalIdentity,
  seedPasskey,
  seedUser,
  server,
  signIn,
} from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const topLevel = vi.hoisted(() => ({ openTopLevel: vi.fn() }));

const webauthn = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn(), createNewAbortSignal: vi.fn() },
}));

vi.mock('@/lib/topLevelNavigation', () => ({ openTopLevel: topLevel.openTopLevel }));
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

const GITHUB_CONTINUE_URL =
  'https://account.example/federation/github/link/continue?state=st_mock_github';

async function openProfilePage() {
  signIn(mockDb, seedUser(mockDb), 'pwd');
  renderRoute(['/account/profile']);
  await screen.findByRole('heading', { name: '个人资料' });
}

beforeEach(() => {
  vi.clearAllMocks();
  server.use(
    http.get('*/v1/federation/providers', () =>
      HttpResponse.json({
        providers: [
          { slug: 'github', display_name: 'GitHub', type: 'oauth2' },
          { slug: 'google', display_name: 'Google', type: 'oidc' },
        ],
      }),
    ),
  );
  webauthn.browserSupportsWebAuthn.mockReturnValue(true);
  webauthn.startAuthentication.mockResolvedValue(ASSERTION);
});

describe('LinkedIdentities', () => {
  it('is hidden when no provider is configured', async () => {
    server.use(http.get('*/v1/federation/providers', () => HttpResponse.json({ providers: [] })));
    await openProfilePage();

    expect(screen.queryByRole('heading', { name: '第三方身份' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '绑定 GitHub' })).not.toBeInTheDocument();
  });

  it('creates the transaction inside the step-up window and redirects the browser', async () => {
    await openProfilePage();
    grantStepUp(mockDb);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '绑定 GitHub' }));

    await waitFor(() => expect(topLevel.openTopLevel).toHaveBeenCalledWith(GITHUB_CONTINUE_URL));
  });

  it('asks for step-up before creating the transaction', async () => {
    seedPasskey(mockDb);
    await openProfilePage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '绑定 GitHub' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '使用通行密钥验证' }));

    await waitFor(() => expect(topLevel.openTopLevel).toHaveBeenCalledWith(GITHUB_CONTINUE_URL));
    expect(mockDb.session?.step_up_expires_at).toBeTruthy();
  });

  it('stays on the page when the user cancels the step-up prompt', async () => {
    seedPasskey(mockDb);
    await openProfilePage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '绑定 GitHub' }));
    await user.click(await screen.findByRole('button', { name: '取消' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument(),
    );
    expect(topLevel.openTopLevel).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains when the identity already belongs to another account', async () => {
    await openProfilePage();
    grantStepUp(mockDb);
    mockDb.takenExternalIdentities.add('github');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '绑定 GitHub' }));

    expect(await screen.findByText('该第三方账号已被绑定到其他账号。')).toBeInTheDocument();
    expect(topLevel.openTopLevel).not.toHaveBeenCalled();
  });

  it('reports an unconfigured provider as unavailable', async () => {
    server.use(
      http.post('*/v1/me/external-identities/github/link-transactions', () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'The provider is not configured.' } },
          { status: 404 },
        ),
      ),
    );
    await openProfilePage();
    grantStepUp(mockDb);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '绑定 GitHub' }));

    expect(await screen.findByText('该登录方式当前不可用，请稍后再试。')).toBeInTheDocument();
    expect(topLevel.openTopLevel).not.toHaveBeenCalled();
  });

  it('shows linked identities with an unbind action instead of a bind button', async () => {
    seedLinkedExternalIdentity(mockDb, 'github', 'GitHub', 'pigeon@example.test');
    await openProfilePage();

    expect(await screen.findByText('已绑定')).toBeInTheDocument();
    expect(screen.getByText('pigeon@example.test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '绑定 GitHub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '绑定 Google' })).toBeInTheDocument();
  });

  it('unbinds inside the step-up window and refreshes the list', async () => {
    seedLinkedExternalIdentity(mockDb, 'github', 'GitHub', 'pigeon@example.test');
    await openProfilePage();
    grantStepUp(mockDb);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '解绑 GitHub' }));

    await waitFor(() => expect(mockDb.linkedExternalIdentities).toHaveLength(0));
    expect(await screen.findByRole('button', { name: '绑定 GitHub' })).toBeInTheDocument();
    expect(await screen.findByText('第三方账号解绑成功')).toBeInTheDocument();
  });

  it('asks for step-up before unlinking', async () => {
    seedLinkedExternalIdentity(mockDb, 'github', 'GitHub', 'pigeon@example.test');
    seedPasskey(mockDb);
    await openProfilePage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '解绑 GitHub' }));

    expect(await screen.findByText('安全验证')).toBeInTheDocument();
    expect(mockDb.linkedExternalIdentities).toHaveLength(1);
  });
});
