import { Badge, Group, Select, Stack, Table, Tabs, Text, TextInput } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import type { AdminAuditResult } from '@/api/endpoints/admin/types';
import { listAdminAuditEvents, listAdminHttpAccessRecords } from '@/api/endpoints/admin/operations';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { statusColor } from '../statusColor';
import { AuditDetailModal } from '../components/AuditDetailModal';
import { HttpAccessRecordDetailModal } from '../components/HttpAccessRecordDetailModal';
import { CursorNav } from '../components/AdminListControls';
import { useCursorPager } from '../components/useCursorPager';

const PAGE_SIZE = 25;

const RESULT_OPTIONS: AdminAuditResult[] = ['success', 'failure', 'denied'];

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

function AuditEventsPanel({ onOpen }: { onOpen: (eventId: string) => void }) {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const [result, setResult] = useState<AdminAuditResult | null>(null);
  const [actorId, setActorId] = useState('');
  const [searchParams] = useSearchParams();
  const [resourceId, setResourceId] = useState(() => searchParams.get('resource_id') ?? '');
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
    <Stack gap="md">
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
                  <Table.Tr
                    key={event.id}
                    onClick={() => onOpen(event.id)}
                    style={{ cursor: 'pointer' }}
                  >
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

function HttpAccessPanel({ onOpen }: { onOpen: (recordId: string) => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [actorId, setActorId] = useState('');
  const pager = useCursorPager();

  const params = {
    limit: PAGE_SIZE,
    cursor: pager.cursor ?? undefined,
    method: method ?? undefined,
    status: /^\d{3}$/.test(status) ? Number(status) : undefined,
    route: route || undefined,
    actor_id: actorId || undefined,
  };

  const query = useQuery({
    queryKey: adminKeys.httpAccessList(params),
    queryFn: ({ signal }) => listAdminHttpAccessRecords(params, signal),
    placeholderData: keepPreviousData,
  });

  const page = query.data;

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="wrap">
        <Select
          value={method}
          onChange={(value) => {
            setMethod(value ?? null);
            pager.reset();
          }}
          data={METHOD_OPTIONS}
          placeholder={t('admin.audit.methodFilter')}
          allowDeselect
          clearable
          w={130}
        />
        <TextInput
          value={status}
          onChange={(event) => {
            setStatus(event.currentTarget.value.replace(/\D/g, '').slice(0, 3));
            pager.reset();
          }}
          placeholder={t('admin.audit.statusFilter')}
          w={110}
        />
        <TextInput
          value={route}
          onChange={(event) => {
            setRoute(event.currentTarget.value.trim());
            pager.reset();
          }}
          placeholder={t('admin.audit.routeFilter')}
          w={280}
        />
        <TextInput
          value={actorId}
          onChange={(event) => {
            setActorId(event.currentTarget.value.trim());
            pager.reset();
          }}
          placeholder={t('admin.audit.actorFilter')}
          w={200}
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
        <PageState kind="empty" title={t('admin.audit.httpEmpty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={920}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.audit.colTime')}</Table.Th>
                  <Table.Th>{t('admin.audit.httpColMethod')}</Table.Th>
                  <Table.Th>{t('admin.audit.httpColRoute')}</Table.Th>
                  <Table.Th>{t('admin.audit.httpColStatus')}</Table.Th>
                  <Table.Th>{t('admin.audit.colActor')}</Table.Th>
                  <Table.Th>{t('admin.audit.httpColRequestId')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {page?.items.map((record) => (
                  <Table.Tr
                    key={record.id}
                    onClick={() => onOpen(record.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(record.occurred_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {record.method}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
                        {record.route}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(record.status_code)} variant="light">
                        {record.status_code}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{record.actor_id ?? record.actor_type}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace">
                        {record.request_id ?? '—'}
                      </Text>
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

export function AdminAuditEventsPage() {
  const { t } = useTranslation();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  return (
    <Stack gap="lg" maw={1080}>
      <AccountPageHeader title={t('admin.audit.title')} subtitle={t('admin.audit.subtitle')} />

      <Tabs defaultValue="events">
        <Tabs.List>
          <Tabs.Tab value="events">{t('admin.audit.tabEvents')}</Tabs.Tab>
          <Tabs.Tab value="http">{t('admin.audit.tabHttp')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="events" pt="md">
          <AuditEventsPanel onOpen={setSelectedEventId} />
        </Tabs.Panel>
        <Tabs.Panel value="http" pt="md">
          <HttpAccessPanel onOpen={setSelectedRecordId} />
        </Tabs.Panel>
      </Tabs>

      <AuditDetailModal
        opened={selectedEventId !== null}
        onClose={() => setSelectedEventId(null)}
        eventId={selectedEventId}
      />
      <HttpAccessRecordDetailModal
        opened={selectedRecordId !== null}
        onClose={() => setSelectedRecordId(null)}
        recordId={selectedRecordId}
      />
    </Stack>
  );
}
