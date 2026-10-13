import { Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminAuditResult } from '@/api/endpoints/admin/types';
import { listAdminAuditEvents } from '@/api/endpoints/admin/operations';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { CursorNav } from '../components/AdminListControls';
import { useCursorPager } from '../components/useCursorPager';

const PAGE_SIZE = 25;

const RESULT_OPTIONS: AdminAuditResult[] = ['success', 'failure', 'denied'];

export function AdminAuditEventsPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const [result, setResult] = useState<AdminAuditResult | null>(null);
  const [actorId, setActorId] = useState('');
  const [resourceId, setResourceId] = useState('');
  const pager = useCursorPager();

  const query = useQuery({
    queryKey: adminKeys.auditList({
      limit: PAGE_SIZE,
      cursor: pager.cursor ?? undefined,
      action: action || undefined,
      result: result ?? undefined,
      actor_id: actorId || undefined,
      resource_id: resourceId || undefined,
    }),
    queryFn: ({ signal }) =>
      listAdminAuditEvents(
        {
          limit: PAGE_SIZE,
          cursor: pager.cursor ?? undefined,
          action: action || undefined,
          result: result ?? undefined,
          actor_id: actorId || undefined,
          resource_id: resourceId || undefined,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const page = query.data;

  return (
    <Stack gap="lg" maw={1080}>
      <AccountPageHeader title={t('admin.audit.title')} subtitle={t('admin.audit.subtitle')} />

      <Group gap="sm" wrap="wrap">
        <TextInput
          value={actorId}
          onChange={(event) => {
            setActorId(event.currentTarget.value.trim());
            pager.reset();
          }}
          placeholder={t('admin.audit.actorFilter')}
          w={200}
        />
        <TextInput
          value={resourceId}
          onChange={(event) => {
            setResourceId(event.currentTarget.value.trim());
            pager.reset();
          }}
          placeholder={t('admin.audit.resourceFilter')}
          w={200}
        />
        <TextInput
          value={action}
          onChange={(event) => {
            setAction(event.currentTarget.value.trim());
            pager.reset();
          }}
          placeholder={t('admin.audit.actionFilter')}
          w={220}
        />
        <Select
          value={result}
          onChange={(value) => {
            setResult((value as AdminAuditResult | null) ?? null);
            pager.reset();
          }}
          data={RESULT_OPTIONS.map((value) => ({ value, label: t(`admin.audit.result.${value}`) }))}
          placeholder={t('admin.audit.resultFilter')}
          allowDeselect
          clearable
          w={140}
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
        <PageState kind="empty" title={t('admin.audit.empty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={860}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.audit.colTime')}</Table.Th>
                  <Table.Th>{t('admin.audit.colAction')}</Table.Th>
                  <Table.Th>{t('admin.audit.colTarget')}</Table.Th>
                  <Table.Th>{t('admin.audit.colResult')}</Table.Th>
                  <Table.Th>{t('admin.audit.colActor')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {page?.items.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>
                      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(event.occurred_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {event.action}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text size="sm">
                          {event.resource_reference ?? event.resource_id ?? '—'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {event.target_type}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{t(`admin.audit.result.${event.result}`)}</Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text size="sm">{event.actor_id ?? event.actor_type}</Text>
                      </Stack>
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
