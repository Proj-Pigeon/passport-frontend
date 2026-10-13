import { Alert, Button, Divider, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import type { AdminChangeRequest } from '@/api/endpoints/admin/types';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { AdminStatusBadge } from './AdminStatusBadge';

export interface ChangeRequestsCardProps {
  requests: AdminChangeRequest[];
  canDecide?: boolean;
  decisionPending?: boolean;
  decisionError?: unknown;
  onDecide?: (request: AdminChangeRequest, decision: 'approve' | 'reject') => void;
}

export function ChangeRequestsCard({
  requests,
  canDecide,
  decisionPending,
  decisionError,
  onDecide,
}: ChangeRequestsCardProps) {
  const { t } = useTranslation();

  if (requests.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title={t('admin.changeRequests.title')}
      description={t('admin.changeRequests.description')}
    >
      <Stack gap={0}>
        {requests.map((request, index) => (
          <Stack key={request.id} gap={0}>
            {index > 0 && <Divider my="sm" />}
            <Stack gap={4}>
              <Group justify="space-between" gap="sm">
                <Group gap="sm">
                  <Text size="sm" fw={500}>
                    {t(`admin.changeAction.${request.action}`)}
                  </Text>
                  <AdminStatusBadge status={request.status} />
                </Group>
                <Text size="xs" c="dimmed">
                  {formatDateTime(request.created_at)}
                </Text>
              </Group>
              <InfoItem label={t('admin.changeRequests.requestedBy')}>
                {request.requested_by}
              </InfoItem>
              {request.reason !== '' && (
                <InfoItem label={t('admin.reason.label')}>{request.reason}</InfoItem>
              )}
              <Group gap="xl">
                <InfoItem label={t('admin.changeRequests.baseVersion')}>
                  {request.base_version}
                </InfoItem>
                <InfoItem label={t('admin.changeRequests.policyVersion')}>
                  {request.policy_version}
                </InfoItem>
              </Group>
              {canDecide && onDecide && request.status === 'pending' && (
                <Group gap="sm" mt={4}>
                  <Button
                    size="xs"
                    variant="light"
                    loading={decisionPending}
                    onClick={() => onDecide(request, 'approve')}
                  >
                    {t('admin.approval.approve')}
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    loading={decisionPending}
                    onClick={() => onDecide(request, 'reject')}
                  >
                    {t('admin.approval.reject')}
                  </Button>
                </Group>
              )}
            </Stack>
          </Stack>
        ))}
        {Boolean(decisionError) && (
          <Alert color="red" variant="light" role="alert" title={t('errors.title')}>
            <Text size="sm">{describeApiError(decisionError)}</Text>
          </Alert>
        )}
      </Stack>
    </SectionCard>
  );
}
