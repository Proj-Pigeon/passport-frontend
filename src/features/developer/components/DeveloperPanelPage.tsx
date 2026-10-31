import { LineChart } from '@mantine/charts';
import {
  Box,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { AdminResourceStatus } from '@/api/endpoints/admin/types';
import {
  getDeveloperOverview,
  listDeveloperResources,
  type DeveloperOverviewPoint,
} from '@/api/endpoints/developer/resources';
import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';
import { AdminSearchInput, CursorNav } from '@/features/admin/components/AdminListControls';
import { AdminStatusBadge } from '@/features/admin/components/AdminStatusBadge';
import { useCursorPager } from '@/features/admin/components/useCursorPager';
import { ApplicationTypeBadge } from '@/features/admin/components/resource/ApplicationTypeCard';
import { developerPanelKeys } from '../keys';
import { recentRange } from '../dateRange';
import { DeveloperApplicationCreateModal } from './DeveloperApplicationCreateModal';
import { DeveloperDateRangePicker } from './DeveloperDateRangePicker';

const PAGE_SIZE = 20;

interface OverviewStatCardProps {
  label: string;
  value: number;
  hint?: string;
}

function OverviewStatCard({ label, value, hint }: OverviewStatCardProps) {
  return (
    <Paper p="lg" h="100%">
      <Stack gap={4}>
        <Text size="xs" c="dimmed" fw={500}>
          {label}
        </Text>
        <Title order={2} fz={28} fw={600} ff="var(--mantine-font-family)">
          {value.toLocaleString()}
        </Title>
        {hint && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function chartData(points: DeveloperOverviewPoint[]) {
  return points.map((point) => ({ date: point.date, authorized: point.count }));
}

export function DeveloperPanelPage() {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState(() => recentRange(30, today));
  const overview = useQuery({
    queryKey: developerPanelKeys.overview(range),
    queryFn: ({ signal }) => getDeveloperOverview(range, signal),
  });

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AdminResourceStatus | null>(null);
  const [createOpened, setCreateOpened] = useState(false);
  const pager = useCursorPager();
  const listQuery = useQuery({
    queryKey: developerPanelKeys.resourceList('application', {
      limit: PAGE_SIZE,
      cursor: pager.cursor ?? undefined,
      q,
      status: status ?? undefined,
    }),
    queryFn: ({ signal }) =>
      listDeveloperResources(
        'application',
        { limit: PAGE_SIZE, cursor: pager.cursor ?? undefined, q, status: status ?? undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const page = listQuery.data;
  const trendTitle = t('developer.overview.trendCard', {
    start: range.start_date,
    end: range.end_date,
  });

  return (
    <>
      <Stack gap="lg" maw={1080}>
        <AccountPageHeader
          title={t('developer.panel.title')}
          subtitle={t('developer.panel.subtitle')}
        />

        <DeveloperDateRangePicker value={range} today={today} onChange={setRange} />

        {overview.isPending ? (
          <PageState kind="loading" minHeight={160} />
        ) : overview.isError ? (
          <PageState
            kind="error"
            minHeight={160}
            error={overview.error}
            description={describeApiError(overview.error)}
            onRetry={() => overview.refetch()}
          />
        ) : (
          overview.data && (
            <>
              <SimpleGrid minColWidth={220} autoFlow="auto-fit" spacing="md">
                <OverviewStatCard
                  label={t('developer.overview.applications')}
                  value={overview.data.applications}
                  hint={t('developer.overview.applicationsHint', {
                    active: overview.data.active_applications,
                  })}
                />
                <OverviewStatCard
                  label={t('developer.overview.users')}
                  value={overview.data.users}
                  hint={t('developer.overview.usersHint')}
                />
                <OverviewStatCard
                  label={t('developer.overview.activeUsers')}
                  value={overview.data.active_users}
                  hint={t('developer.overview.activeUsersHint')}
                />
              </SimpleGrid>

              <Paper p="lg">
                <Stack gap="md">
                  <Title order={2} fz={16} fw={600}>
                    {trendTitle}
                  </Title>
                  <LineChart
                    data={chartData(overview.data.daily_authorized)}
                    dataKey="date"
                    series={[
                      {
                        name: 'authorized',
                        color: 'pigeon.6',
                        label: t('developer.overview.seriesAuthorized'),
                      },
                    ]}
                    h={260}
                    curveType="monotone"
                    withLegend
                    withDots={false}
                    tickLine="none"
                    gridAxis="xy"
                    aria-label={trendTitle}
                  />
                </Stack>
              </Paper>
            </>
          )
        )}

        <Paper p={{ base: 'md', sm: 'lg' }}>
          <Stack gap="md">
            <Stack gap={4}>
              <Title order={2} size="h4">
                {t('developer.panel.applications')}
              </Title>
              <Text size="sm" c="dimmed">
                {t('developer.panel.applicationsHint')}
              </Text>
            </Stack>
            <Group gap="sm" justify="space-between" align="center">
              <Group gap="sm" wrap="nowrap" w={{ base: '100%', sm: 'auto' }}>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <AdminSearchInput
                    value={q}
                    onChange={(next) => {
                      setQ(next);
                      pager.reset();
                    }}
                  />
                </Box>
                <Button
                  size="md"
                  leftSection={<IconPlus size={18} />}
                  style={{ flexShrink: 0 }}
                  onClick={() => setCreateOpened(true)}
                >
                  {t('developer.create.submit')}
                </Button>
              </Group>
              <Select
                aria-label={t('admin.resources.statusFilter')}
                value={status}
                onChange={(value) => {
                  setStatus((value as AdminResourceStatus | null) ?? null);
                  pager.reset();
                }}
                data={(['draft', 'active', 'disabled'] as AdminResourceStatus[]).map((value) => ({
                  value,
                  label: t(`admin.status.${value}`),
                }))}
                placeholder={t('admin.resources.statusFilter')}
                allowDeselect
                clearable
                size="md"
                w={{ base: '100%', sm: 160 }}
              />
            </Group>

            {listQuery.isError ? (
              <PageState
                kind="error"
                description={describeApiError(listQuery.error)}
                error={listQuery.error}
                onRetry={() => listQuery.refetch()}
              />
            ) : listQuery.isPending ? (
              <PageState kind="loading" />
            ) : page && page.items.length === 0 ? (
              <PageState
                kind="empty"
                title={t('authorization.noApplications')}
                description={t('developer.panel.emptyHint')}
              />
            ) : (
              <>
                <Table.ScrollContainer minWidth={720}>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t('admin.resources.colName')}</Table.Th>
                        <Table.Th>{t('devices.applicationType')}</Table.Th>
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
                              to={`/account/developer/applications/${encodeURIComponent(resource.id)}/overview`}
                              fw={500}
                            >
                              {resource.display_name}
                            </UnstyledButton>
                          </Table.Td>
                          <Table.Td>
                            <ApplicationTypeBadge
                              value={resource.configuration['application_type']}
                            />
                          </Table.Td>
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
                  loading={listQuery.isFetching}
                />
              </>
            )}
          </Stack>
        </Paper>
      </Stack>
      <DeveloperApplicationCreateModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
      />
    </>
  );
}
