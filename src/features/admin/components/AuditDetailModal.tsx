import { Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { getAdminAuditEvent } from '@/api/endpoints/admin/operations';
import type { AdminAuditEventDetail } from '@/api/endpoints/admin/types';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { HttpDetailSection, JsonBlock } from './AuditDetailBlocks';

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {typeof children === 'string' ? (
        <Text size="sm" style={{ wordBreak: 'break-word' }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Stack>
  );
}

function EventDetailBody({ event }: { event: AdminAuditEventDetail }) {
  const { t } = useTranslation();
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <DetailField label={t('admin.audit.colTime')}>
          {formatDateTime(event.occurred_at)}
        </DetailField>
        <DetailField label={t('admin.audit.fieldAction')}>
          <Text size="sm" ff="monospace">
            {event.action}
          </Text>
        </DetailField>
        <DetailField label={t('admin.audit.fieldResult')}>
          {t(`admin.audit.result.${event.result}`)}
        </DetailField>
        <DetailField label={t('admin.audit.fieldTarget')}>
          <Stack gap={0}>
            <Text size="sm">{event.target_type}</Text>
            <Text size="sm" ff="monospace">
              {event.resource_id ?? event.resource_reference ?? '—'}
            </Text>
          </Stack>
        </DetailField>
        <DetailField label={t('admin.audit.colActor')}>
          {event.actor_id ?? event.actor_type}
        </DetailField>
        <DetailField label={t('admin.audit.fieldRequestId')}>
          <Text size="sm" ff="monospace">
            {event.request_id ?? '—'}
          </Text>
        </DetailField>
      </SimpleGrid>
      <JsonBlock
        label={t('admin.audit.fieldMetadata')}
        body={JSON.stringify(event.metadata ?? {}, null, 2)}
        mediaType={null}
        truncated={false}
      />
      {event.http === null ? (
        <Text size="sm" c="dimmed">
          {t('admin.audit.httpNotRecorded')}
        </Text>
      ) : (
        <HttpDetailSection http={event.http} />
      )}
    </Stack>
  );
}

export function AuditDetailModal({
  opened,
  onClose,
  eventId,
}: {
  opened: boolean;
  onClose: () => void;
  eventId: string | null;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: adminKeys.auditDetail(eventId ?? 'none'),
    queryFn: ({ signal }) => getAdminAuditEvent(eventId ?? '', signal),
    enabled: opened && eventId !== null,
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('admin.audit.detailTitle')}
      size="lg"
      withinPortal
    >
      {query.isError ? (
        <PageState
          kind="error"
          description={describeApiError(query.error)}
          error={query.error}
          onRetry={() => query.refetch()}
        />
      ) : query.isPending ? (
        <PageState kind="loading" />
      ) : query.data ? (
        <EventDetailBody event={query.data} />
      ) : null}
    </Modal>
  );
}
