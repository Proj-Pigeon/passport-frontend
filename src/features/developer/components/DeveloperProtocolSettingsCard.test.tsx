import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminResourceView } from '@/api/endpoints/admin/types';
import type * as DeveloperApi from '@/api/endpoints/developer/resources';
import { patchDeveloperResource } from '@/api/endpoints/developer/resources';
import { ApiError } from '@/api/errors';
import type * as StepUpModule from '@/features/step-up/useStepUp';
import type { UseStepUpResult } from '@/features/step-up/useStepUp';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/render';

import { DeveloperProtocolSettingsCard } from './DeveloperProtocolSettingsCard';
import type { DeveloperSectionProps } from './developerTypes';

const { runWithStepUp } = vi.hoisted(() => ({
  runWithStepUp: vi.fn<UseStepUpResult['runWithStepUp']>(),
}));

vi.mock('@/features/step-up/useStepUp', async (importOriginal) => ({
  ...(await importOriginal<typeof StepUpModule>()),
  useStepUp: () => ({ runWithStepUp }),
}));

vi.mock('@/api/endpoints/developer/resources', async (importOriginal) => ({
  ...(await importOriginal<typeof DeveloperApi>()),
  patchDeveloperResource: vi.fn(),
}));

const patch = vi.mocked(patchDeveloperResource);
const etag = '"protocol-v7"';

function makeResource(
  kind: 'oauth' | 'saml' = 'oauth',
  configuration: Record<string, unknown> = {},
): AdminResourceView {
  return {
    id: `protocol_${kind}`,
    kind,
    application_id: 'apl_settings',
    display_name: 'Protocol settings application',
    status: 'draft',
    version: 7,
    configuration: {
      ...(kind === 'oauth'
        ? {
            client_type: 'confidential',
            allowed_scopes: ['openid', 'profile'],
            token_endpoint_auth_method: 'client_secret_basic',
            subject_type: 'pairwise',
            redirect_uris: [{ id: 'uri_1', uri: 'https://client.example/callback' }],
            refresh_token_ttl_seconds: 3600,
            require_consent: true,
          }
        : {
            entity_id: 'urn:example:original-sp',
            require_signed_requests: true,
            allow_idp_initiated: false,
            acs_urls: [{ id: 'acs_1', uri: 'https://sp.example/acs' }],
            signing_certificates: [{ id: 'cert_1', pem: 'Existing certificate' }],
            attribute_policy: { email: 'email' },
          }),
      ...configuration,
    },
    published_configuration: null,
    configuration_version_id: null,
    created_at: '2026-10-28T00:00:00Z',
    updated_at: '2026-10-28T00:00:00Z',
  };
}

function renderCard(
  kind: 'oauth' | 'saml' = 'oauth',
  configuration: Record<string, unknown> = {},
  overrides: Partial<DeveloperSectionProps> = {},
) {
  const refresh = vi.fn(async () => {});
  const props = { kind, resource: makeResource(kind, configuration), etag, refresh, ...overrides };
  return { ...renderWithProviders(<DeveloperProtocolSettingsCard {...props} />), props, refresh };
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: i18n.t('developer.protocolSettings.edit') }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
  return dialog;
}

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: RegExp,
  option: string,
) {
  await user.click(within(dialog).getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function replaceScopes(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  scopes: string[],
) {
  const input = within(dialog).getByRole('combobox', { name: /^权限范围/ });
  await user.click(input);
  await user.keyboard('{Backspace}{Backspace}');
  if (scopes.length) await user.paste(scopes.join(','));
  await user.tab();
}

async function submit(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: '提交' }));
}

beforeEach(() => {
  runWithStepUp.mockReset().mockImplementation(async (action) => action());
  patch.mockReset().mockResolvedValue(makeResource());
});

describe('DeveloperProtocolSettingsCard OAuth', () => {
  it('shows grouped values and loads the current configuration into the editor', async () => {
    renderCard('oauth', {
      allowed_scopes: ['openid', 'custom:read'],
      token_endpoint_auth_method: 'client_secret_post',
      subject_type: 'public',
    });
    expect(screen.getByText('custom:read')).toBeInTheDocument();
    expect(screen.getByText('client_secret_post')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('admin.applicationCreate.public'))).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    expect(within(dialog).getByText('openid')).toBeInTheDocument();
    expect(within(dialog).getByText('custom:read')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: '客户端认证方式' })).toHaveValue(
      'client_secret_post',
    );
    expect(within(dialog).getByRole('combobox', { name: '用户标识' })).toHaveValue(
      i18n.t('admin.applicationCreate.public'),
    );
    expect(within(dialog).getByRole('button', { name: '提交' })).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  });

  it('patches only edited OAuth fields with the ETag after mandatory verification', async () => {
    const { refresh, props } = renderCard();
    const original = structuredClone(props.resource.configuration);
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await replaceScopes(user, dialog, ['openid', 'email', 'orders:read.v1_test-write']);
    await selectOption(user, dialog, /客户端认证方式/, 'client_secret_post');
    await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(runWithStepUp).toHaveBeenCalledWith(expect.any(Function), { requireVerification: true });
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'oauth',
      props.resource.id,
      {
        configuration: {
          allowed_scopes: ['openid', 'email', 'orders:read.v1_test-write'],
          token_endpoint_auth_method: 'client_secret_post',
          subject_type: 'public',
        },
      },
      etag,
    );
    expect(props.resource.configuration).toEqual(original);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each([
    ['empty list', []],
    ['missing openid', ['profile']],
    ['incorrect openid case', ['OpenID']],
    ['invalid character', ['openid', 'read/*']],
    ['whitespace', ['openid', 'read write']],
    ['overlong scope', ['openid', 's'.repeat(81)]],
    ['too many scopes', ['openid', ...Array.from({ length: 32 }, (_, i) => `scope${i}`)]],
  ])('blocks %s before any verification or request', async (_name, scopes) => {
    renderCard();
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await replaceScopes(user, dialog, scopes as string[]);
    await submit(user, dialog);
    expect(within(dialog).getByRole('combobox', { name: /^权限范围/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
    expect(runWithStepUp).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('accepts 32 valid scopes including an 80-character scope', async () => {
    const { props, refresh } = renderCard();
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const scopes = [
      'openid',
      's'.repeat(80),
      ...Array.from({ length: 30 }, (_, i) => `scope:${i}`),
    ];
    await replaceScopes(user, dialog, scopes);
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'oauth',
      props.resource.id,
      { configuration: { allowed_scopes: scopes } },
      etag,
    );
  });

  it('never offers or patches secret authentication for a public client', async () => {
    const { props, refresh } = renderCard('oauth', {
      client_type: 'public',
      token_endpoint_auth_method: 'none',
    });
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    expect(
      within(dialog).queryByRole('combobox', { name: '客户端认证方式' }),
    ).not.toBeInTheDocument();
    const auth = within(dialog).getByRole('textbox', { name: '客户端认证方式' });
    expect(auth).toHaveValue('none');
    expect(auth).toHaveAttribute('readonly');
    expect(within(dialog).queryByText(/client_secret/)).not.toBeInTheDocument();
    await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'oauth',
      props.resource.id,
      { configuration: { subject_type: 'public' } },
      etag,
    );
  });
});

describe('DeveloperProtocolSettingsCard SAML', () => {
  it('loads configured switches, including non-default values, and patches only edited fields', async () => {
    const { props, refresh } = renderCard('saml', {
      require_signed_requests: false,
      allow_idp_initiated: true,
    });
    expect(screen.getByText('urn:example:original-sp')).toBeInTheDocument();
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const entity = within(dialog).getByRole('textbox', { name: /^SP Entity ID/ });
    expect(entity).toHaveValue('urn:example:original-sp');
    const signed = within(dialog).getByRole('switch', { name: '要求 SP 签名登录请求' });
    const initiated = within(dialog).getByRole('switch', { name: '允许由 Passport 发起登录' });
    expect(signed).not.toBeChecked();
    expect(initiated).toBeChecked();
    fireEvent.change(entity, { target: { value: 'https://sp.example/new-entity' } });
    await user.click(signed);
    await user.click(initiated);
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'saml',
      props.resource.id,
      {
        configuration: {
          entity_id: 'https://sp.example/new-entity',
          require_signed_requests: true,
          allow_idp_initiated: false,
        },
      },
      etag,
    );
    expect(runWithStepUp).toHaveBeenCalledWith(expect.any(Function), { requireVerification: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps secure defaults for an empty draft, blocks an empty Entity ID, and saves after correction', async () => {
    const { props, refresh } = renderCard('saml', {
      entity_id: '',
      require_signed_requests: undefined,
      allow_idp_initiated: undefined,
    });
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    expect(within(dialog).getByRole('switch', { name: '要求 SP 签名登录请求' })).toBeChecked();
    const initiated = within(dialog).getByRole('switch', { name: '允许由 Passport 发起登录' });
    expect(initiated).not.toBeChecked();
    await user.click(initiated);
    await submit(user, dialog);
    expect(within(dialog).getByText(i18n.t('admin.applicationCreate.invalid'))).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
    expect(runWithStepUp).not.toHaveBeenCalled();
    expect(initiated).toBeChecked();
    expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
    await user.click(initiated);
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^SP Entity ID/ }), {
      target: { value: 'urn:example:new-sp' },
    });
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'saml',
      props.resource.id,
      { configuration: { entity_id: 'urn:example:new-sp' } },
      etag,
    );
  });

  it.each([
    ['empty', ''],
    ['missing scheme', 'sp.example/entity'],
    ['invalid scheme', '1https:entity'],
    ['missing scheme-specific value', 'urn:'],
    ['whitespace', 'urn:example:bad entity'],
    ['leading whitespace', ' urn:example:sp'],
    ['trailing whitespace', 'urn:example:sp '],
    ['wildcard', 'https://sp.example/*'],
    ['overlong', `urn:${'s'.repeat(2045)}`],
  ])('rejects an %s Entity ID', async (_name, value) => {
    renderCard('saml');
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const entity = within(dialog).getByRole('textbox', { name: /^SP Entity ID/ });
    fireEvent.change(entity, { target: { value } });
    await submit(user, dialog);
    expect(entity).toHaveAttribute('aria-invalid', 'true');
    expect(entity).toHaveValue(value);
    expect(runWithStepUp).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it('accepts an Entity ID at the 2048-character boundary', async () => {
    const { props, refresh } = renderCard('saml');
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    const entityId = `custom+v1.test-scheme:${'s'.repeat(2026)}`;
    expect(entityId).toHaveLength(2048);
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^SP Entity ID/ }), {
      target: { value: entityId },
    });
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'saml',
      props.resource.id,
      { configuration: { entity_id: entityId } },
      etag,
    );
  });
});

describe('DeveloperProtocolSettingsCard mutation lifecycle', () => {
  it.each(['oauth', 'saml'] as const)(
    'rejects trailing newlines in loaded %s configuration',
    async (kind) => {
      renderCard(kind, {
        allowed_scopes: ['openid', 'profile\n'],
        entity_id: 'urn:example:sp\n',
      });
      const user = userEvent.setup();
      const dialog = await openEditor(user);
      if (kind === 'oauth') {
        await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
      } else {
        await user.click(within(dialog).getByRole('switch', { name: '允许由 Passport 发起登录' }));
      }
      await submit(user, dialog);
      const input = within(dialog).getByRole(kind === 'oauth' ? 'combobox' : 'textbox', {
        name: kind === 'oauth' ? /^权限范围/ : /^SP Entity ID/,
      });
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(patch).not.toHaveBeenCalled();
    },
  );

  it.each(['oauth', 'saml'] as const)(
    'disables all %s inputs and closing while a request is pending',
    async (kind) => {
      let release = (_result: AdminResourceView) => {};
      patch.mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      const { props, refresh } = renderCard(kind);
      const user = userEvent.setup();
      const dialog = await openEditor(user);
      if (kind === 'oauth') {
        await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
      } else {
        await user.click(within(dialog).getByRole('switch', { name: '允许由 Passport 发起登录' }));
      }
      await submit(user, dialog);
      await waitFor(() => expect(patch).toHaveBeenCalledOnce());
      for (const input of within(dialog).queryAllByRole('textbox')) expect(input).toBeDisabled();
      for (const select of within(dialog).queryAllByRole('combobox')) expect(select).toBeDisabled();
      for (const toggle of within(dialog).queryAllByRole('switch')) expect(toggle).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: '提交' })).toBeDisabled();
      await user.keyboard('{Escape}');
      expect(dialog).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
      release(props.resource);
      await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    },
  );

  it.each([
    [412, 'precondition_failed'],
    [409, 'precondition_failed'],
    [503, 'dependency_unavailable'],
  ])('preserves input after error %s/%s and allows retry', async (status, code) => {
    patch.mockRejectedValueOnce(new ApiError({ status, code, message: 'Cannot update' }));
    const { props, refresh } = renderCard();
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
    await submit(user, dialog);
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    if (code === 'precondition_failed') {
      expect(within(dialog).getByText(i18n.t('admin.config.conflictHint'))).toBeInTheDocument();
    }
    expect(within(dialog).getByRole('combobox', { name: '用户标识' })).toHaveValue(
      i18n.t('admin.applicationCreate.public'),
    );
    expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '提交' })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(patch).toHaveBeenLastCalledWith(
      'oauth',
      props.resource.id,
      { configuration: { subject_type: 'public' } },
      etag,
    );
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it('keeps the editing ETag across background refreshes and reloads values and ETag when reopened', async () => {
    patch.mockRejectedValueOnce(
      new ApiError({ status: 412, code: 'precondition_failed', message: 'Conflict' }),
    );
    const { props, rerender } = renderCard();
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
    const nextProps = {
      ...props,
      etag: '"protocol-v8"',
      resource: makeResource('oauth', { allowed_scopes: ['openid', 'email'] }),
    };
    rerender(<DeveloperProtocolSettingsCard {...nextProps} />);
    await submit(user, dialog);
    await within(dialog).findByRole('alert');
    expect(patch).toHaveBeenLastCalledWith(
      'oauth',
      props.resource.id,
      { configuration: { subject_type: 'public' } },
      etag,
    );
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const nextDialog = await openEditor(user);
    expect(within(nextDialog).getByText('email')).toBeInTheDocument();
    expect(nextDialog.querySelector('input[type="hidden"]')).toHaveValue('openid,email');
    expect(within(nextDialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(nextDialog).getByRole('combobox', { name: '用户标识' })).toHaveValue(
      i18n.t('admin.applicationCreate.pairwise'),
    );
    await selectOption(user, nextDialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
    await submit(user, nextDialog);
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenLastCalledWith(
      'oauth',
      props.resource.id,
      { configuration: { subject_type: 'public' } },
      nextProps.etag,
    );
  });

  it('applies active resource changes without mutating published values locally before refresh', async () => {
    const resource = makeResource();
    resource.status = 'active';
    resource.published_configuration = structuredClone(resource.configuration);
    patch.mockResolvedValueOnce({
      ...resource,
      change_request_id: 'cr_settings',
      change_request_status: 'applied',
    });
    const { refresh } = renderCard('oauth', {}, { resource });
    const user = userEvent.setup();
    const dialog = await openEditor(user);
    await selectOption(user, dialog, /用户标识/, i18n.t('admin.applicationCreate.public'));
    await submit(user, dialog);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(i18n.t('admin.resources.changeAutoApproved'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('admin.applicationCreate.pairwise'))).toBeInTheDocument();
    expect(resource.configuration['subject_type']).toBe('pairwise');
    expect(resource.published_configuration?.['subject_type']).toBe('pairwise');
    expect(patch).toHaveBeenCalledExactlyOnceWith(
      'oauth',
      resource.id,
      { configuration: { subject_type: 'public' } },
      etag,
    );
  });

  it('shows only the summary without write permission', () => {
    renderCard('oauth', {}, { canWrite: false });
    expect(screen.getByText('openid')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('developer.protocolSettings.edit') }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
