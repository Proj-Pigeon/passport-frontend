import { Stack, Table, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { listAdminConfigurationVersions } from '@/api/endpoints/admin/operations';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { AdminSearchInput, CursorNav } from '../components/AdminListControls';
import { useCursorPager } from '../components/useCursorPager';

const PAGE_SIZE = 25;

export function AdminConfigurationVersionsPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const pager = useCursorPager();

  const query = useQuery({
    queryKey: adminKeys.configurationVersionList({
      limit: PAGE_SIZE,
      cursor: pager.cursor ?? undefined,
      q,
    }),
    queryFn: ({ signal }) =>
      listAdminConfigurationVersions(
        { limit: PAGE_SIZE, cursor: pager.cursor ?? undefined, q },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const page = query.data;

  return (
    <Stack gap="lg" maw={1080}>
      <AccountPageHeader
        title={t('admin.configVersions.title')}
        subtitle={t('admin.configVersions.subtitle')}
      />

      <AdminSearchInput
        value={q}
        onChange={(next) => {
          setQ(next);
          pager.reset();
        }}
        placeholder={t('admin.configVersions.searchPlaceholder')}
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
        <PageState kind="empty" title={t('admin.configVersions.empty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.configVersions.colVersion')}</Table.Th>
                  <Table.Th>{t('admin.configVersions.colDescription')}</Table.Th>
                  <Table.Th>{t('admin.configVersions.colCreatedBy')}</Table.Th>
                  <Table.Th>{t('admin.configVersions.colCreatedAt')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {page?.items.map((version) => (
                  <Table.Tr key={version.id}>
                    <Table.Td>
                      <UnstyledButton
                        component={Link}
                        to={`/admin/configuration-versions/${encodeURIComponent(version.id)}`}
                        fw={500}
                      >
                        v{version.version}
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td>{version.description ?? '—'}</Table.Td>
                    <Table.Td>{version.created_by}</Table.Td>
                    <Table.Td>{formatDateTime(version.created_at)}</Table.Td>
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
