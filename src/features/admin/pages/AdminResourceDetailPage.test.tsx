import { fireEvent, screen, within } from '@testing-library/react';
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
    await user.click(screen.getByRole('button', { name: '展开配置 JSON' }));
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

  it('reveals a redeemed secret once without caching it', async () => {
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

    const { queryClient } = renderRoute(['/admin/oauth-clients/adr_oc']);

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
  });
});
