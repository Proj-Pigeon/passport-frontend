import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import * as resourcesApi from '@/api/endpoints/admin/resources';
import {
  mockDb,
  seedUser,
  signInAdmin,
  grantAdminStepUp,
  seedAdminResource,
} from '@/test/mocks/server';
import { renderRoute, renderWithProviders } from '@/test/render';
import { ApplicationCreateModal } from './ApplicationCreateModal';
import { protocolConfiguration, type ProtocolDraft } from './applicationPresets';
const fields: ProtocolDraft = {
  redirectUris: 'https://example.com/callback',
  scopes: ['openid', 'profile'],
  authMethod: 'client_secret_basic',
  subjectType: 'public',
  sessionDurationHours: '',
  entityId: '',
  acsUrls: '',
  certificate: '',
  requireSignedRequests: true,
  allowIdpInitiated: false,
};
function admin() {
  signInAdmin(mockDb, seedUser(mockDb), ['super_admin']);
  grantAdminStepUp(mockDb);
}
function presetOptions(select: HTMLElement) {
  const list = document.getElementById(select.getAttribute('aria-controls') ?? '');
  if (!list) throw new Error('Preset options are not mounted');
  return within(list)
    .getAllByRole('option', { hidden: true })
    .map((option) => option.textContent);
}
async function fillText(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  value: string,
) {
  await user.click(field);
  await user.paste(value);
}
describe('Application types', () => {
  it('generates a public device client without a redirect URI or secret', () => {
    const config = protocolConfiguration('device', fields, 'GuEarth');
    expect(config['client_type']).toBe('public');
    expect(config['token_endpoint_auth_method']).toBe('none');
    expect(config['redirect_uris']).toEqual([]);
    expect(config).not.toHaveProperty('client_secret');
  });
  it('locks a classified application type', async () => {
    admin();
    seedAdminResource(mockDb, {
      id: 'apl_device',
      display_name: 'GuEarth',
      configuration: { application_type: 'device' },
    });
    renderRoute(['/admin/applications/apl_device']);
    expect(await screen.findByText(/应用类型已锁定/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '应用类型' })).not.toBeInTheDocument();
  });
  it('assigns a type to a legacy application through a reasoned change', async () => {
    admin();
    seedAdminResource(mockDb, { id: 'apl_legacy', display_name: 'Legacy' });
    renderRoute(['/admin/applications/apl_legacy']);
    const user = userEvent.setup();
    const select = await screen.findByRole('combobox', { name: '应用类型' }, { timeout: 5000 });
    await user.click(select);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(select).toHaveValue('设备授权');
    await user.click(screen.getByRole('button', { name: '提交' }));
    const modal = await screen.findByRole('dialog');
    await user.type(within(modal).getByLabelText(/^操作原因/), 'Classify compatible application');
    await user.click(within(modal).getByRole('button', { name: '提交' }));
    expect(await screen.findByText(/应用类型已锁定/)).toBeInTheDocument();
    expect(mockDb.adminResources[0]?.configuration['application_type']).toBe('device');
  });
  it('hides the device preset for a fixed legacy parent and links to classification', async () => {
    admin();
    seedAdminResource(mockDb, { id: 'apl_legacy', display_name: 'Legacy' });
    renderRoute(['/admin/applications/apl_legacy/protocols']);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '添加 OAuth 客户端' }, { timeout: 5000 }),
    );
    const modal = await screen.findByRole('dialog');
    const preset = within(modal).getByRole('combobox', { name: /^接入预设/ });
    await user.click(preset);
    expect(presetOptions(preset)).toEqual([
      '服务端 Web 应用 · OIDC',
      '单页应用 · OIDC + PKCE',
      '原生应用 · OIDC + PKCE',
    ]);
    expect(within(modal).getByText(/设备授权需先将所属应用分类/)).toBeInTheDocument();
    expect(within(modal).getByRole('link', { name: '前往应用详情' })).toHaveAttribute(
      'href',
      '/admin/applications/apl_legacy',
    );
    await user.keyboard('{Escape}');
    await user.click(within(modal).getByRole('link', { name: '前往应用详情' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('combobox', { name: '应用类型' })).toBeInTheDocument();
  });
  it('drops a selected device preset when switching to a legacy parent and validates redirects', async () => {
    admin();
    seedAdminResource(mockDb, {
      id: 'apl_device',
      display_name: 'GuEarth',
      configuration: { application_type: 'device' },
    });
    seedAdminResource(mockDb, { id: 'apl_legacy', display_name: 'Legacy' });
    const create = vi.spyOn(resourcesApi, 'createAdminResource');
    renderWithProviders(
      <MemoryRouter>
        <ModalsProvider>
          <ApplicationCreateModal kind="oauth" opened onClose={() => {}} />
        </ModalsProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    const modal = await screen.findByRole('dialog');
    const parent = within(modal).getByRole('combobox', { name: /^所属应用/ });
    await waitFor(() => expect(parent).toBeEnabled());
    await user.type(parent, 'GuEarth');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(parent).toHaveValue('GuEarth (apl_device)');
    const preset = within(modal).getByRole('combobox', { name: /^接入预设/ });
    expect(preset).toHaveValue('设备授权');
    await user.click(preset);
    await user.keyboard('{ArrowDown}{Enter}');
    await fillText(user, within(modal).getByLabelText(/^显示名称/), 'Legacy client');
    await fillText(user, within(modal).getByLabelText(/^操作原因/), 'Add compatible client');
    await user.clear(parent);
    await user.type(parent, 'Legacy');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(parent).toHaveValue('Legacy (apl_legacy)');
    expect(preset).toHaveValue('服务端 Web 应用 · OIDC');
    expect(within(modal).getByText(/设备授权需先将所属应用分类/)).toBeInTheDocument();
    const redirect = within(modal).getByLabelText(/^回调地址/);
    expect(redirect).toBeRequired();
    await user.click(preset);
    expect(presetOptions(preset)).not.toContain('设备授权');
    await user.keyboard('{Escape}');
    const submit = within(modal).getByRole('button', { name: '创建草稿' });
    fireEvent.submit(submit);
    expect(await within(modal).findByText(/最多 32 个不同的 HTTPS/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await fillText(user, redirect, 'https://legacy.example/callback');
    await user.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      'oauth',
      expect.objectContaining({
        application_id: 'apl_legacy',
        configuration: expect.objectContaining({
          client_type: 'confidential',
          token_endpoint_auth_method: 'client_secret_basic',
          redirect_uris: [{ uri: 'https://legacy.example/callback' }],
        }),
      }),
    );
  });
  it('keeps device client creation available for a classified parent', async () => {
    admin();
    seedAdminResource(mockDb, {
      id: 'apl_device',
      display_name: 'GuEarth',
      configuration: { application_type: 'device' },
    });
    renderRoute(['/admin/applications/apl_device/protocols']);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: '添加 OAuth 客户端' }, { timeout: 5000 }),
    );
    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByRole('combobox', { name: /^接入预设/ })).toHaveValue('设备授权');
    expect(within(modal).queryByLabelText(/^回调地址/)).not.toBeInTheDocument();
    expect(within(modal).queryByRole('link', { name: '前往应用详情' })).not.toBeInTheDocument();
    await fillText(user, within(modal).getByLabelText(/^显示名称/), 'GuEarth desktop');
    await fillText(user, within(modal).getByLabelText(/^操作原因/), 'Add device client');
    await user.click(within(modal).getByRole('button', { name: '创建草稿' }));
    await waitFor(() =>
      expect(mockDb.adminResources.find((item) => item.kind === 'oauth')).toMatchObject({
        application_id: 'apl_device',
        configuration: {
          client_type: 'public',
          token_endpoint_auth_method: 'none',
          redirect_uris: [],
        },
      }),
    );
  });
  it('keeps creating new device applications with a public client', async () => {
    admin();
    renderRoute(['/admin/applications']);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '创建草稿' }));
    const modal = await screen.findByRole('dialog');
    await user.click(within(modal).getByRole('combobox', { name: /^接入预设/ }));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(within(modal).getByRole('combobox', { name: /^接入预设/ })).toHaveValue('设备授权');
    expect(within(modal).queryByLabelText(/^回调地址/)).not.toBeInTheDocument();
    expect(within(modal).queryByRole('link', { name: '前往应用详情' })).not.toBeInTheDocument();
    await fillText(user, within(modal).getByLabelText(/^显示名称/), 'New device app');
    await fillText(user, within(modal).getByLabelText(/^操作原因/), 'Create device application');
    await user.click(within(modal).getByRole('button', { name: '创建草稿' }));
    await waitFor(() => expect(mockDb.adminResources).toHaveLength(2));
    const application = mockDb.adminResources.find((item) => item.kind === 'application');
    expect(application?.configuration['application_type']).toBe('device');
    expect(mockDb.adminResources.find((item) => item.kind === 'oauth')).toMatchObject({
      application_id: application?.id,
      configuration: {
        client_type: 'public',
        token_endpoint_auth_method: 'none',
        redirect_uris: [],
      },
    });
  });
});
