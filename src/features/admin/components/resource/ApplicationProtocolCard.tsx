import { Button, Group, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { listAdminResources } from '@/api/endpoints/admin/resources';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import type { ApplicationPreset } from './applicationPresets';
import { adminKeys } from '../../keys';
import { AdminStatusBadge } from '../AdminStatusBadge';
import { CreateResourceModal } from './CreateResourceModal';
import { hasAdminCapability, useAdminSession } from '../../session/useAdminSession';

const DETAIL_PATHS: Record<'oauth' | 'saml', (id: string) => string> = {
  oauth: (id) => `/admin/oauth-clients/${encodeURIComponent(id)}`,
  saml: (id) => `/admin/saml-service-providers/${encodeURIComponent(id)}`,
};

export function ApplicationProtocolCard({
  kind,
  applicationId,
  applicationType,
}: {
  kind: 'oauth' | 'saml';
  applicationId: string;
  applicationType?: ApplicationPreset;
}) {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();
  const [createOpened, setCreateOpened] = useState(false);

  const query = useQuery({
    queryKey: adminKeys.resourceList(kind, { application_id: applicationId, limit: 100 }),
    queryFn: ({ signal }) =>
      listAdminResources(kind, { application_id: applicationId, limit: 100 }, signal),
    enabled: applicationId.length > 0,
    placeholderData: keepPreviousData,
  });

  const canWrite =
    hasAdminCapability(session, 'applications:write') &&
    (!applicationType || (applicationType === 'saml' ? kind === 'saml' : kind === 'oauth'));
  const emptyKey =
    kind === 'oauth'
      ? 'admin.applicationProtocols.clientsEmpty'
      : 'admin.applicationProtocols.samlEmpty';
  const emptyHintKey =
    kind === 'oauth'
      ? 'admin.applicationProtocols.clientsEmptyHint'
      : 'admin.applicationProtocols.samlEmptyHint';
  const addKey =
    kind === 'oauth'
      ? 'admin.applicationProtocols.addClient'
      : 'admin.applicationProtocols.addSaml';

  return (
    <>
      {query.isError ? (
        <PageState
          kind="error"
          description={describeApiError(query.error)}
          error={query.error}
          onRetry={() => query.refetch()}
        />
      ) : query.isPending ? (
        <PageState kind="loading" />
      ) : (
        <Stack gap="sm">
          {query.data && query.data.items.length === 0 ? (
            <Stack gap={4} py="xs">
              <Text size="sm" fw={500}>
                {t(emptyKey)}
              </Text>
              <Text size="sm" c="dimmed">
                {canWrite ? t(emptyHintKey) : t('admin.applicationProtocols.protocolsNone')}
              </Text>
            </Stack>
          ) : (
            <Table.ScrollContainer minWidth={560}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('admin.resources.colName')}</Table.Th>
                    {kind === 'oauth' && <Table.Th>{t('admin.resources.colClientId')}</Table.Th>}
                    <Table.Th>{t('admin.resources.colStatus')}</Table.Th>
                    <Table.Th>{t('admin.resources.colUpdatedAt')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {query.data?.items.map((resource) => (
                    <Table.Tr key={resource.id}>
                      <Table.Td>
                        <UnstyledButton
                          component={Link}
                          to={DETAIL_PATHS[kind](resource.id)}
                          fw={500}
                        >
                          {resource.display_name}
                        </UnstyledButton>
                      </Table.Td>
                      {kind === 'oauth' && <Table.Td>{resource.client_id ?? '—'}</Table.Td>}
                      <Table.Td>
                        <AdminStatusBadge status={resource.status} />
                      </Table.Td>
                      <Table.Td>{formatDateTime(resource.updated_at)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {canWrite && (
            <Group>
              <Button size="xs" variant="light" onClick={() => setCreateOpened(true)}>
                {t(addKey)}
              </Button>
            </Group>
          )}
        </Stack>
      )}
      <CreateResourceModal
        kind={kind}
        fixedApplicationId={applicationId}
        applicationType={applicationType}
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
      />
    </>
  );
}
