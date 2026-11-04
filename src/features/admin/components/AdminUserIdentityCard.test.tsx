import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { IdentityRecord } from '@/api/endpoints/account/identity';
import {
  grantAdminStepUp,
  mockDb,
  seedAdminUser,
  seedUser,
  signInAdmin,
} from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function fixture() {
  const admin = seedUser(mockDb);
  signInAdmin(mockDb, admin, ['user_admin']);
  grantAdminStepUp(mockDb);
  const target = seedAdminUser(mockDb, { id: 'usr_identity_owner', username: 'verified-user' });
  const record: IdentityRecord = {
    id: 'kyc_materials',
    session_id: 'session-materials',
    status: 'Approved',
    review_state: 'approved',
    full_name_mask: '张*',
    document_number_mask: '1101**********1234',
    document_type: 'ID Card',
    issuing_country: 'CHN',
    decision_at: '2026-11-03T00:00:00Z',
    created_at: '2026-11-03T00:00:00Z',
    updated_at: '2026-11-03T00:00:00Z',
    verified: true,
  };
  mockDb.identities.set(target.id, [record]);
  mockDb.identityMaterials.set(record.id, {
    id: record.id,
    full_name: '张三',
    document_number: '110101199001011234',
    date_of_birth: '1990-01-01',
    document_type: 'ID Card',
    issuing_country: 'CHN',
    images: [{ kind: 'document_front', url: 'https://media.example/document' }],
  });
  return { target, record };
}

describe('AdminUserIdentityCard', () => {
  it('reveals material only after requesting it and clears it when closed', async () => {
    const { target } = fixture();
    renderRoute([`/admin/users/${target.id}/overview`]);
    expect(await screen.findByText('张*')).toBeInTheDocument();
    expect(screen.queryByText('张三')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '查看实名材料' }));
    expect(await screen.findByText('张三')).toBeInTheDocument();
    expect(screen.getByText('本次浏览已记录审计')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '证件正面' })).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByText('张三')).not.toBeInTheDocument();
  });

  it('requires a reason and updates the masked status after rejection', async () => {
    const { target, record } = fixture();
    renderRoute([`/admin/users/${target.id}/overview`]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '驳回' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: '驳回' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: '操作理由' }), '证件信息不一致');
    await user.click(confirm);
    expect(await screen.findByText('已驳回')).toBeInTheDocument();
    expect(record.review_state).toBe('rejected');
  });

  it('hides material and review actions from a read-only administrator', async () => {
    const { target } = fixture();
    mockDb.adminSession!.capabilities = ['users:read'];
    renderRoute([`/admin/users/${target.id}/overview`]);
    await screen.findByText('张*');
    expect(screen.queryByRole('button', { name: '查看实名材料' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '通过' })).not.toBeInTheDocument();
  });
});
