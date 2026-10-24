import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  seedAdminAuditEvent,
  seedAdminHttpAccessRecord,
  seedUser,
  signInAdmin,
} from '@/test/mocks/db';
import { mockDb } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

function signInAs(roles: 'auditor' | 'super_admin') {
  const user = seedUser(mockDb);
  signInAdmin(mockDb, user, [roles]);
  return user;
}

describe('admin audit events page', () => {
  it('lists audit events and opens a detail modal with captured HTTP data', async () => {
    const user = userEvent.setup();
    signInAs('super_admin');
    seedAdminAuditEvent(mockDb, { id: 'evt_1', request_id: 'req_audit_1' });
    seedAdminHttpAccessRecord(mockDb, { id: 'acc_1', request_id: 'req_audit_1' });

    renderRoute(['/admin/audit-events']);

    expect(
      await screen.findByText('admin.user.suspended', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByText('admin.user.suspended'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('事件详情')).toBeInTheDocument();
    expect(within(dialog).getByText('POST')).toBeInTheDocument();
    expect(within(dialog).getByText('201')).toBeInTheDocument();
    expect(within(dialog).getByText(/alice@example\.com/)).toBeInTheDocument();
    expect(within(dialog).getByText(/"result": "ok"/)).toBeInTheDocument();
  });

  it('lists http access records and opens a record detail modal', async () => {
    const user = userEvent.setup();
    signInAs('super_admin');
    seedAdminHttpAccessRecord(mockDb, { id: 'acc_9', request_id: 'req_audit_9' });

    renderRoute(['/admin/audit-events']);

    await user.click(await screen.findByRole('tab', { name: 'HTTP 访问记录' }));
    expect(await screen.findByText('/v1/sessions/password')).toBeInTheDocument();
    await user.click(screen.getByText('/v1/sessions/password'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('访问记录详情')).toBeInTheDocument();
    expect(within(dialog).getByText('req_audit_9')).toBeInTheDocument();
    expect(within(dialog).getByText(/alice@example\.com/)).toBeInTheDocument();
  });

  it('shows the not-recorded hint for events without captured HTTP data', async () => {
    const user = userEvent.setup();
    signInAs('super_admin');
    seedAdminAuditEvent(mockDb, {
      id: 'evt_2',
      action: 'admin.key.rotation_requested',
      request_id: 'req_legacy',
    });

    renderRoute(['/admin/audit-events']);

    await user.click(await screen.findByText('admin.key.rotation_requested'));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('该事件发生时尚未采集 HTTP 数据（未记录）'),
    ).toBeInTheDocument();
  });
});
