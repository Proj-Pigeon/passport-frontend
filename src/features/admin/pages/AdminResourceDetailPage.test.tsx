import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  grantAdminStepUp,
  seedAdminChangeRequest,
  seedAdminResource,
  seedUser,
  signInAdmin,
} from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function signInAsMaker() {
  const user = seedUser(mockDb);
  signInAdmin(mockDb, user, ['federation_admin']);
  grantAdminStepUp(mockDb);
  return user;
}

describe('admin resource detail page', () => {
  it('redirects bare resource detail URLs to overview and preserves query parameters', async () => {
    const maker = seedUser(mockDb);
    signInAdmin(mockDb, maker, ['super_admin']);
    seedAdminResource(mockDb, {
      id: 'adr_app',
      kind: 'application',
      display_name: 'Portal App',
    });

    const { router } = renderRoute(['/admin/applications/adr_app?from=list']);

    expect(await screen.findByRole('heading', { name: 'Portal App' })).toBeInTheDocument();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/applications/adr_app/overview'),
    );
    expect(router.state.location.search).toBe('?from=list');
  });

  it('shows the complete configuration version ID in a tooltip', async () => {
    const user = userEvent.setup();
    const maker = seedUser(mockDb);
    const configurationVersionId = 'cfg_gQvRXHyYNZvUB5FaD1Y4lg';
    signInAdmin(mockDb, maker, ['super_admin']);
    seedAdminResource(mockDb, {
      id: 'adr_app',
      kind: 'application',
      configuration_version_id: configurationVersionId,
    });

    renderRoute(['/admin/applications/adr_app/overview']);

    const value = await screen.findByText(configurationVersionId);
    await user.hover(value);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(configurationVersionId);
  });

  it('shows the If-Match conflict hint when the version moved', async () => {
    const user = userEvent.setup();
    signInAsMaker();
    seedAdminResource(mockDb, {
      id: 'adr_1',
      kind: 'federation',
      display_name: 'Demo IdP',
      configuration: { issuer: 'https://idp.example' },
    });

    renderRoute(['/admin/federation-providers/adr_1']);

    expect(await screen.findByRole('heading', { name: 'Demo IdP' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '接入指南与配置' }));
    await user.click(await screen.findByRole('button', { name: '展开配置 JSON' }));
    const editor = screen.getByLabelText(/^配置 JSON/);
    fireEvent.change(editor, { target: { value: '{"issuer":"https://idp.example/v2"}' } });
    await user.type(screen.getByLabelText(/^操作原因/), 'rotate issuer');
    const resource = mockDb.adminResources[0];
    if (resource) {
      resource.version = 2;
    }
    await user.click(screen.getByRole('button', { name: '保存配置' }));

    expect(await screen.findByText('资源已被修改，请刷新后重试。')).toBeInTheDocument();
  });

  it('notifies when the sole administrator activation request is auto-approved', async () => {
    const user = userEvent.setup();
    const maker = seedUser(mockDb);
    signInAdmin(mockDb, maker, ['super_admin']);
    grantAdminStepUp(mockDb);
    seedAdminResource(mockDb, {
      id: 'adr_app',
      kind: 'application',
      display_name: 'Solo App',
    });

    renderRoute(['/admin/applications/adr_app']);

    await user.click(await screen.findByRole('button', { name: '申请激活' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^操作原因/), 'go live');
    await user.click(within(dialog).getByRole('button', { name: '提交' }));

    expect(await screen.findByText('申请已提交，并已自动通过审核。')).toBeInTheDocument();
  });

  it('blocks duplicate activation requests while one is pending', async () => {
    const maker = seedUser(mockDb);
    signInAdmin(mockDb, maker, ['super_admin']);
    grantAdminStepUp(mockDb);
    const resource = seedAdminResource(mockDb, {
      id: 'adr_app',
      kind: 'application',
      display_name: 'Demo App',
    });
    seedAdminChangeRequest(resource);

    renderRoute(['/admin/applications/adr_app']);

    expect(await screen.findByRole('button', { name: '申请激活' })).toBeDisabled();
    expect(
      await screen.findByText('已有同类申请等待审批，请先在下方变更请求中处理。'),
    ).toBeInTheDocument();
  });

  it('reveals a redeemed secret once without caching it and navigates back to parent application', async () => {
    const user = userEvent.setup();
    const maker = seedUser(mockDb);
    signInAdmin(mockDb, maker, ['super_admin']);
    grantAdminStepUp(mockDb);
    seedAdminResource(mockDb, { id: 'adr_app', display_name: 'Parent App' });
    const client = seedAdminResource(mockDb, {
      id: 'adr_oc',
      kind: 'oauth',
      application_id: 'adr_app',
      client_id: 'oc_mock',
      display_name: 'Web Client',
      configuration: { client_type: 'confidential' },
    });
    seedAdminChangeRequest(client, {
      id: 'cr_secret',
      action: 'create_secret',
      status: 'approved',
      requested_by: 'usr_seed',
    });

    const { queryClient, router } = renderRoute(['/admin/oauth-clients/adr_oc']);

    expect(await screen.findByRole('heading', { name: 'Web Client' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '兑换（创建密钥）' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^操作原因/), 'redeem approved secret');
    await user.click(within(dialog).getByRole('button', { name: '兑换并显示密钥' }));

    expect(await screen.findByDisplayValue('sec_mock_1')).toBeInTheDocument();
    const cached = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state.data),
    );
    expect(cached).not.toContain('sec_mock_1');

    await user.click(screen.getByRole('button', { name: '我已保存' }));
    await user.click(screen.getByRole('link', { name: '返回所属应用' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/admin/applications/adr_app/protocols'),
    );
  });
});
