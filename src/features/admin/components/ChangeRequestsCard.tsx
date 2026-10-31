import { Alert, Button, Group, Modal, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminChangeRequest } from '@/api/endpoints/admin/types';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { AdminStatusBadge } from './AdminStatusBadge';

export interface ChangeRequestsCardProps {
  requests: AdminChangeRequest[];
  canDecide?: boolean;
  decisionPending?: boolean;
  decisionError?: unknown;
  showEmpty?: boolean;
  onDecide?: (request: AdminChangeRequest, decision: 'approve' | 'reject') => void;
}

export function ChangeRequestsCard({
  requests,
  canDecide,
  decisionPending,
  decisionError,
  showEmpty = false,
  onDecide,
}: ChangeRequestsCardProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AdminChangeRequest | null>(null);

  if (requests.length === 0 && !showEmpty) {
    return null;
  }

  return (
    <>
      <SectionCard
        title={t('admin.changeRequests.title')}
        description={t('admin.changeRequests.description')}
      >
        <Stack gap="sm">
          {requests.length === 0 ? (
            <PageState kind="empty" title={t('admin.changeRequests.empty')} minHeight={80} />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('admin.audit.colAction')}</Table.Th>
                    <Table.Th>{t('admin.resources.colStatus')}</Table.Th>
                    <Table.Th>{t('admin.changeRequests.requestedBy')}</Table.Th>
                    <Table.Th>{t('admin.changeRequests.baseVersion')}</Table.Th>
                    <Table.Th>{t('admin.audit.colTime')}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {requests.map((request) => (
                    <Table.Tr key={request.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {t(`admin.changeAction.${request.action}`)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <AdminStatusBadge status={request.status} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {request.requested_by}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">v{request.base_version}</Text>
                      </Table.Td>
                      <Table.Td style={{ whiteSpace: 'nowrap' }}>
                        <Text size="xs" c="dimmed">
                          {formatDateTime(request.created_at)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => setSelected(request)}
                          >
                            {t('admin.changeRequests.viewDetail')}
                          </Button>
                          {canDecide && onDecide && request.status === 'pending' && (
                            <>
                              <Button
                                size="compact-xs"
                                variant="light"
                                loading={decisionPending}
                                onClick={() => onDecide(request, 'approve')}
                              >
                                {t('admin.approval.approve')}
                              </Button>
                              <Button
                                size="compact-xs"
                                color="red"
                                variant="light"
                                loading={decisionPending}
                                onClick={() => onDecide(request, 'reject')}
                              >
                                {t('admin.approval.reject')}
                              </Button>
                            </>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {Boolean(decisionError) && (
            <Alert color="red" variant="light" role="alert" title={t('errors.title')}>
              <Text size="sm">{describeApiError(decisionError)}</Text>
            </Alert>
          )}
        </Stack>
      </SectionCard>

      <Modal
        opened={selected !== null}
        onClose={() => setSelected(null)}
        title={t('admin.changeRequests.detailTitle')}
        withinPortal
      >
        {selected && (
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600}>{t(`admin.changeAction.${selected.action}`)}</Text>
              <AdminStatusBadge status={selected.status} />
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <InfoItem label={t('admin.changeRequests.requestedBy')}>
                <Text size="sm" ff="monospace">
                  {selected.requested_by}
                </Text>
              </InfoItem>
              <InfoItem label={t('admin.audit.colTime')}>
                <Text size="sm">{formatDateTime(selected.created_at)}</Text>
              </InfoItem>
              <InfoItem label={t('admin.changeRequests.baseVersion')}>
                <Text size="sm">{selected.base_version}</Text>
              </InfoItem>
              <InfoItem label={t('admin.changeRequests.policyVersion')}>
                <Text size="sm">{selected.policy_version}</Text>
              </InfoItem>
            </SimpleGrid>
            {canDecide && onDecide && selected.status === 'pending' && (
              <Group justify="flex-end" gap="sm">
                <Button
                  size="xs"
                  variant="light"
                  loading={decisionPending}
                  onClick={() => {
                    const target = selected;
                    setSelected(null);
                    onDecide(target, 'approve');
                  }}
                >
                  {t('admin.approval.approve')}
                </Button>
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  loading={decisionPending}
                  onClick={() => {
                    const target = selected;
                    setSelected(null);
                    onDecide(target, 'reject');
                  }}
                >
                  {t('admin.approval.reject')}
                </Button>
              </Group>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
