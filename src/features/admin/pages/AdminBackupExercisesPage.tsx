import { Select, Stack, Table, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminBackupExerciseStatus } from '@/api/endpoints/admin/types';
import { listAdminBackupExercises } from '@/api/endpoints/admin/operations';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { CursorNav } from '../components/AdminListControls';
import { AdminStatusBadge } from '../components/AdminStatusBadge';
import { useCursorPager } from '../components/useCursorPager';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: AdminBackupExerciseStatus[] = ['passed', 'failed', 'running'];

export function AdminBackupExercisesPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AdminBackupExerciseStatus | null>(null);
  const pager = useCursorPager();

  const query = useQuery({
    queryKey: adminKeys.backupExerciseList({
      limit: PAGE_SIZE,
      cursor: pager.cursor ?? undefined,
      status: status ?? undefined,
    }),
    queryFn: ({ signal }) =>
      listAdminBackupExercises(
        { limit: PAGE_SIZE, cursor: pager.cursor ?? undefined, status: status ?? undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const page = query.data;

  return (
    <Stack gap="lg" maw={1080}>
      <AccountPageHeader title={t('admin.backup.title')} subtitle={t('admin.backup.subtitle')} />

      <Select
        value={status}
        onChange={(value) => {
          setStatus((value as AdminBackupExerciseStatus | null) ?? null);
          pager.reset();
        }}
        data={STATUS_OPTIONS.map((value) => ({ value, label: t(`admin.status.${value}`) }))}
        placeholder={t('admin.backup.statusFilter')}
        allowDeselect
        clearable
        w={180}
      />

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
        <PageState kind="empty" title={t('admin.backup.empty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.backup.colStartedAt')}</Table.Th>
                  <Table.Th>{t('admin.backup.colCompletedAt')}</Table.Th>
                  <Table.Th>{t('admin.backup.colStatus')}</Table.Th>
                  <Table.Th>{t('admin.backup.colRto')}</Table.Th>
                  <Table.Th>{t('admin.backup.colRpo')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {page?.items.map((exercise) => (
                  <Table.Tr key={exercise.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(exercise.started_at) ?? '—'}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(exercise.completed_at) ?? '—'}
                    </Table.Td>
                    <Table.Td>
                      <AdminStatusBadge status={exercise.status} />
                    </Table.Td>
                    <Table.Td>
                      {exercise.recovery_time_seconds !== null ? (
                        <Text size="sm">{exercise.recovery_time_seconds}s</Text>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      {exercise.recovery_point_seconds !== null ? (
                        <Text size="sm">{exercise.recovery_point_seconds}s</Text>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <CursorNav
            pager={pager}
            nextCursor={page?.next_cursor ?? null}
            loading={query.isFetching}
          />
        </>
      )}
    </Stack>
  );
}
