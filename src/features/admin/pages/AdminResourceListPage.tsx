import { Button, Group, Select, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { AdminResourceStatus } from '@/api/endpoints/admin/types';
import { listAdminResources } from '@/api/endpoints/admin/resources';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { ApplicationTypeBadge } from '../components/resource/ApplicationTypeCard';
import { adminKeys } from '../keys';
import { AdminSearchInput, CursorNav } from '../components/AdminListControls';
import { AdminStatusBadge } from '../components/AdminStatusBadge';
import { useCursorPager } from '../components/useCursorPager';
import { CreateResourceModal } from '../components/resource/CreateResourceModal';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';

const PAGE_SIZE = 20;

const DETAIL_PATHS = {
  application: (id: string) => `/admin/applications/${encodeURIComponent(id)}`,
  federation: (id: string) => `/admin/federation-providers/${encodeURIComponent(id)}`,
};

const STATUS_OPTIONS: AdminResourceStatus[] = ['draft', 'active', 'disabled'];

export function AdminResourceListPage({ kind }: { kind: 'application' | 'federation' }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminResourceStatus | null>(null);
  const [createOpened, setCreateOpened] = useState(false);
  const pager = useCursorPager();

  const query = useQuery({
    queryKey: adminKeys.resourceList(kind, {
      limit: PAGE_SIZE,
      cursor: pager.cursor ?? undefined,
      q,
      status: status ?? undefined,
    }),
    queryFn: ({ signal }) =>
      listAdminResources(
        kind,
        { limit: PAGE_SIZE, cursor: pager.cursor ?? undefined, q, status: status ?? undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const page = query.data;

  return (
    <>
      <Stack gap="lg" maw={1080}>
        <AccountPageHeader
          title={t(`admin.resources.${kind}.title`)}
          subtitle={t(`admin.resources.${kind}.subtitle`)}
        />
        <Group gap="sm" wrap="wrap" justify="space-between">
          <Group gap="sm" wrap="wrap">
            <AdminSearchInput
              value={q}
              onChange={(next) => {
                setQ(next);
                pager.reset();
              }}
            />
            <Select
              value={status}
              onChange={(value) => {
                setStatus((value as AdminResourceStatus | null) ?? null);
                pager.reset();
              }}
              data={STATUS_OPTIONS.map((value) => ({ value, label: t(`admin.status.${value}`) }))}
              placeholder={t('admin.resources.statusFilter')}
              allowDeselect
              clearable
              w={160}
            />
          </Group>
          <CreateButton kind={kind} onOpen={() => setCreateOpened(true)} />
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
          <PageState
            kind="empty"
            title={t('admin.resources.empty')}
            description={t('admin.resources.emptyHint')}
          />
        ) : (
          <>
            <Table.ScrollContainer minWidth={720}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('admin.resources.colName')}</Table.Th>
                    {kind === 'application' && (
                      <Table.Th>{t('admin.applicationProtocols.colProtocols')}</Table.Th>
                    )}
                    {kind === 'application' && <Table.Th>{t('devices.applicationType')}</Table.Th>}
                    <Table.Th>{t('admin.resources.colStatus')}</Table.Th>
                    <Table.Th>{t('admin.resources.colVersion')}</Table.Th>
                    <Table.Th>{t('admin.resources.colUpdatedAt')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {page?.items.map((resource) => (
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
                      {kind === 'application' && (
                        <Table.Td>
                          {(resource.oauth_client_count ?? 0) +
                            (resource.saml_provider_count ?? 0) >
                          0 ? (
                            <Text size="sm">
                              {t('admin.applicationProtocols.protocolsSummary', {
                                oauth: resource.oauth_client_count ?? 0,
                                saml: resource.saml_provider_count ?? 0,
                              })}
                            </Text>
                          ) : (
                            <Text size="sm" c="dimmed">
                              {t('admin.applicationProtocols.protocolsNone')}
                            </Text>
                          )}
                        </Table.Td>
                      )}
                      {kind === 'application' && (
                        <Table.Td>
                          <ApplicationTypeBadge
                            value={resource.configuration['application_type']}
                          />
                        </Table.Td>
                      )}
                      <Table.Td>
                        <AdminStatusBadge status={resource.status} />
                      </Table.Td>
                      <Table.Td>{resource.version}</Table.Td>
                      <Table.Td>{formatDateTime(resource.updated_at)}</Table.Td>
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
      <CreateResourceModal
        kind={kind}
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
      />
    </>
  );
}

function CreateButton({
  kind,
  onOpen,
}: {
  kind: 'application' | 'federation';
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();
  const writeCapability = kind === 'federation' ? 'federation:write' : 'applications:write';
  if (!hasAdminCapability(session, writeCapability)) {
    return null;
  }
  return (
    <Button size="xs" variant="light" onClick={onOpen}>
      {t('admin.resources.create')}
    </Button>
  );
}
