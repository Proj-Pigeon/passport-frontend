import { Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getAdminHttpAccessRecord } from '@/api/endpoints/admin/operations';
import type { AdminHttpAccessRecordDetail } from '@/api/endpoints/admin/types';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { HttpDetailSection } from './AuditDetailBlocks';

function RecordDetailBody({ record }: { record: AdminHttpAccessRecordDetail }) {
  const { t } = useTranslation();
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            {t('admin.audit.colTime')}
          </Text>
          <Text size="sm">{formatDateTime(record.occurred_at)}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            {t('admin.audit.colActor')}
          </Text>
          <Text size="sm">{record.actor_id ?? record.actor_ref ?? record.actor_type}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            {t('admin.audit.fieldRequestId')}
          </Text>
          <Text size="sm" ff="monospace">
            {record.request_id ?? '—'}
          </Text>
        </Stack>
      </SimpleGrid>
      <HttpDetailSection http={record} />
    </Stack>
  );
}

export function HttpAccessRecordDetailModal({
  opened,
  onClose,
  recordId,
}: {
  opened: boolean;
  onClose: () => void;
  recordId: string | null;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: adminKeys.httpAccessDetail(recordId ?? 'none'),
    queryFn: ({ signal }) => getAdminHttpAccessRecord(recordId ?? '', signal),
    enabled: opened && recordId !== null,
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('admin.audit.httpDetailTitle')}
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
        <RecordDetailBody record={query.data} />
      ) : null}
    </Modal>
  );
}
