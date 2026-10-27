import { DonutChart, LineChart } from '@mantine/charts';
import { Grid, Paper, SimpleGrid, Stack, Text, Title, type MantineColor } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { AccountPageHeader } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import type { AdminOverviewPoint } from '@/api/endpoints/admin/types';

import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminOverview } from '../session/useAdminOverview';

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

interface TrendDatum {
  date: string;
  [series: string]: string | number;
}

interface ChartSeries {
  name: string;
  color: MantineColor;
  label: string;
}

function mergeSeries(entries: Array<{ key: string; points: AdminOverviewPoint[] }>): TrendDatum[] {
  const first = entries[0];
  if (!first) {
    return [];
  }
  return first.points.map((point, index) => {
    const datum: TrendDatum = { date: point.date.slice(5) };
    for (const entry of entries) {
      datum[entry.key] = entry.points[index]?.count ?? 0;
    }
    return datum;
  });
}

export function AdminOverviewPage() {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();

  const canReadUsers = hasAdminCapability(session, 'users:read');
  const canReadApplications = hasAdminCapability(session, 'applications:read');
  const canReadAudit = hasAdminCapability(session, 'audit:read');
  const canReadOverview = session !== null && (canReadUsers || canReadApplications || canReadAudit);

  const overview = useAdminOverview(canReadOverview);

  const users = overview.data?.users;
  const applications = overview.data?.applications;
  const audit = overview.data?.audit;
  const windowDays = overview.data?.window_days ?? 30;

  const stats: OverviewStatCardProps[] = [];
  if (users) {
    stats.push({ label: t('admin.overview.statUsers'), value: users.total });
    stats.push({
      label: t('admin.overview.statActiveUsers'),
      value: users.active,
      hint: t('admin.overview.statActiveSessions', { count: users.active_sessions }),
    });
  }
  if (applications) {
    stats.push({ label: t('admin.overview.statApplications'), value: applications.total });
    stats.push({
      label: t('admin.overview.statAuthorizationRequests'),
      value: applications.authorization_requests_window,
      hint: t('admin.overview.statAuthorizationRequestsHint', { days: windowDays }),
    });
  }
  if (audit) {
    stats.push({
      label: t('admin.overview.statHttpRequests'),
      value: audit.http_requests_window,
      hint: t('admin.overview.statHttpRequestsHint', { days: windowDays }),
    });
    stats.push({ label: t('admin.overview.statAuditEvents'), value: audit.events_window });
  }

  const trendEntries: Array<{ key: string; points: AdminOverviewPoint[] }> = [];
  const trendSeries: ChartSeries[] = [];
  if (users) {
    trendEntries.push({ key: 'users', points: users.daily_new });
    trendSeries.push({
      name: 'users',
      color: 'pigeon.6',
      label: t('admin.overview.seriesNewUsers'),
    });
    trendEntries.push({ key: 'logins', points: users.daily_logins });
    trendSeries.push({
      name: 'logins',
      color: 'teal.6',
      label: t('admin.overview.seriesLogins'),
    });
  }
  if (applications) {
    trendEntries.push({ key: 'authorizations', points: applications.daily_authorizations });
    trendSeries.push({
      name: 'authorizations',
      color: 'violet.6',
      label: t('admin.overview.seriesAuthorizations'),
    });
  }

  const auditEntries: Array<{ key: string; points: AdminOverviewPoint[] }> = [];
  const auditSeries: ChartSeries[] = [];
  if (audit) {
    auditEntries.push({ key: 'requests', points: audit.daily_http_requests });
    auditSeries.push({
      name: 'requests',
      color: 'pigeon.6',
      label: t('admin.overview.seriesHttpRequests'),
    });
    auditEntries.push({ key: 'events', points: audit.daily_events });
    auditSeries.push({
      name: 'events',
      color: 'orange.6',
      label: t('admin.overview.seriesAuditEvents'),
    });
  }

  const statusCells: Array<{ name: string; value: number; color: MantineColor }> = users
    ? [
        { name: t('admin.status.active'), value: users.active, color: 'teal.6' },
        {
          name: t('admin.status.pending_verification'),
          value: users.pending_verification,
          color: 'yellow.6',
        },
        { name: t('admin.status.suspended'), value: users.suspended, color: 'red.6' },
        { name: t('admin.status.deactivated'), value: users.deactivated, color: 'gray.6' },
      ].filter((cell) => cell.value > 0)
    : [];

  return (
    <Stack gap="lg">
      <AccountPageHeader title={t('admin.overview.title')} />

      {canReadOverview && overview.isPending && <PageState kind="loading" minHeight={200} />}
      {canReadOverview && overview.isError && (
        <PageState kind="error" minHeight={200} onRetry={() => void overview.refetch()} />
      )}

      {overview.data && stats.length > 0 && (
        <SimpleGrid minColWidth={220} autoFlow="auto-fit" spacing="md">
          {stats.map((stat) => (
            <OverviewStatCard key={stat.label} {...stat} />
          ))}
        </SimpleGrid>
      )}

      {overview.data && trendSeries.length > 0 && (
        <Grid>
          <Grid.Col span={{ base: 12, md: statusCells.length > 0 ? 8 : 12 }}>
            <Paper p="lg" h="100%">
              <Stack gap="md">
                <Title order={2} fz={16} fw={600}>
                  {t('admin.overview.trendCard', { days: windowDays })}
                </Title>
                <LineChart
                  data={mergeSeries(trendEntries)}
                  dataKey="date"
                  series={trendSeries}
                  h={260}
                  curveType="monotone"
                  withLegend
                  withDots={false}
                  tickLine="none"
                  gridAxis="xy"
                  aria-label={t('admin.overview.trendCard', { days: windowDays })}
                />
              </Stack>
            </Paper>
          </Grid.Col>
          {statusCells.length > 0 && (
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper p="lg" h="100%">
                <Stack gap="md">
                  <Title order={2} fz={16} fw={600}>
                    {t('admin.overview.userStatusCard')}
                  </Title>
                  <DonutChart
                    data={statusCells}
                    withLegend
                    thickness={24}
                    size={180}
                    aria-label={t('admin.overview.userStatusCard')}
                  />
                </Stack>
              </Paper>
            </Grid.Col>
          )}
        </Grid>
      )}

      {overview.data && auditSeries.length > 0 && (
        <Paper p="lg">
          <Stack gap="md">
            <Title order={2} fz={16} fw={600}>
              {t('admin.overview.auditCard', { days: windowDays })}
            </Title>
            <LineChart
              data={mergeSeries(auditEntries)}
              dataKey="date"
              series={auditSeries}
              h={240}
              curveType="monotone"
              withLegend
              withDots={false}
              tickLine="none"
              gridAxis="xy"
              aria-label={t('admin.overview.auditCard', { days: windowDays })}
            />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
