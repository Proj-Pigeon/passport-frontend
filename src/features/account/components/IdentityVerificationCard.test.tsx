import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { IdentityRecord } from '@/api/endpoints/account/identity';
import { mockDb, seedUser, signIn } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

export const identityRecord: IdentityRecord = {
  id: 'kyc_test',
  session_id: 'session-test',
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

describe('IdentityVerificationCard', () => {
  it.each([
    ['approved', 'Approved', true, '已通过', '重新认证'],
    ['pending', 'In Progress', false, '认证中', '继续认证'],
    ['rejected', 'Declined', false, '未通过', '重新认证'],
    ['reset', 'Approved', false, '未开始', '重新认证'],
    ['pending', 'Expired', false, '未开始', '重新认证'],
  ] as const)(
    'renders %s state without revealing plaintext',
    async (reviewState, status, verified, label, action) => {
      const account = seedUser(mockDb);
      signIn(mockDb, account, 'pwd');
      mockDb.identityEnabled = true;
      mockDb.identities.set(account.id, [
        { ...identityRecord, review_state: reviewState, status, verified },
      ]);
      renderRoute(['/account/security']);
      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
      expect(screen.queryByText('张三')).not.toBeInTheDocument();
      if (verified) {
        expect(screen.getByText(/1101\*+1234/)).toBeInTheDocument();
        expect(screen.getByText('当前状态')).toBeInTheDocument();
        expect(screen.getByText('法定姓名')).toBeInTheDocument();
        expect(screen.getByText('证件类型')).toBeInTheDocument();
        expect(screen.getByText('居民身份证')).toBeInTheDocument();
        expect(screen.getByText('证件号码')).toBeInTheDocument();
        expect(screen.getByText('认证渠道')).toBeInTheDocument();
        expect(screen.getByText('Didit')).toBeInTheDocument();
      }
    },
  );

  it('opens a hosted iframe for a new verification', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    mockDb.identityEnabled = true;
    renderRoute(['/account/security']);
    await userEvent.setup().click(await screen.findByRole('button', { name: '开始认证' }));
    expect(await screen.findByTitle('身份核验窗口')).toHaveAttribute(
      'src',
      expect.stringContaining('https://verify.didit.me/'),
    );
  });

  it('hides verification when the server has disabled it', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    renderRoute(['/account/security']);
    await screen.findByText('还没有通行密钥');
    expect(screen.queryByRole('button', { name: '开始认证' })).not.toBeInTheDocument();
  });
});
