import { Group, Select, Stack, Table, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { listAdminUsers } from '@/api/endpoints/admin/users';
import type { AdminUserStatusFilter } from '@/api/endpoints/admin/types';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { AdminSearchInput, CursorNav } from '../components/AdminListControls';
import { AdminStatusBadge } from '../components/AdminStatusBadge';
import { useCursorPager } from '../components/useCursorPager';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: AdminUserStatusFilter; labelKey: string }[] = [
  { value: 'active', labelKey: 'admin.status.active' },
  { value: 'pending_verification', labelKey: 'admin.status.pending_verification' },
  { value: 'suspended', labelKey: 'admin.status.suspended' },
  { value: 'deactivated', labelKey: 'admin.status.deactivated' },
];

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminUserStatusFilter | null>(null);
  const pager = useCursorPager();

  const query = useQuery({
    queryKey: adminKeys.userList({
      limit: PAGE_SIZE,
      cursor: pager.cursor ?? undefined,
      q,
      status: status ?? undefined,
    }),
    queryFn: ({ signal }) =>
      listAdminUsers(
        { limit: PAGE_SIZE, cursor: pager.cursor ?? undefined, q, status: status ?? undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const page = query.data;
  const loading = query.isFetching;

  return (
    <Stack gap="lg" maw={1080}>
      <AccountPageHeader title={t('admin.users.title')} subtitle={t('admin.users.subtitle')} />
      <Group gap="sm" wrap="wrap">
        <AdminSearchInput
          value={q}
          onChange={(next) => {
            setQ(next);
            pager.reset();
          }}
          placeholder={t('admin.users.searchPlaceholder')}
        />
        <Select
          value={status}
          onChange={(value) => {
            setStatus((value as AdminUserStatusFilter | null) ?? null);
            pager.reset();
          }}
          data={STATUS_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          placeholder={t('admin.users.statusFilter')}
          allowDeselect
          clearable
          w={180}
        />
      </Group>

      {query.isError ? (
        <PageState
          kind="error"
          description={describeApiError(query.error)}
          error={query.error}
          onRetry={() => query.refetch()}
        />
      ) : query.isPending ? (
        <PageState kind="loading" />
      ) : page && page.items.length === 0 ? (
        <PageState kind="empty" title={t('admin.users.empty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.users.colUsername')}</Table.Th>
                  <Table.Th>{t('admin.users.colDisplayName')}</Table.Th>
                  <Table.Th>{t('admin.users.colStatus')}</Table.Th>
                  <Table.Th>{t('admin.users.colSecurityEpoch')}</Table.Th>
                  <Table.Th>{t('admin.users.colUpdatedAt')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {page?.items.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>
                      <UnstyledButton
                        component={Link}
                        to={`/admin/users/${encodeURIComponent(user.id)}`}
                        fw={500}
                      >
                        {user.username}
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td>{user.display_name ?? '—'}</Table.Td>
                    <Table.Td>
                      <AdminStatusBadge status={user.status} />
                    </Table.Td>
                    <Table.Td>{user.security_epoch}</Table.Td>
                    <Table.Td>{formatDateTime(user.updated_at)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <CursorNav pager={pager} nextCursor={page?.next_cursor ?? null} loading={loading} />
        </>
      )}
    </Stack>
  );
}
