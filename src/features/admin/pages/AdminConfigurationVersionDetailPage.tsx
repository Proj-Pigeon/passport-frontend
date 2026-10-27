import { Anchor, Breadcrumbs, Code, Grid, Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { getAdminConfigurationVersion } from '@/api/endpoints/admin/operations';
import { AccountPageHeader, InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { AdminPageContainer } from '../components/AdminPageShell';
import { adminKeys } from '../keys';

export function AdminConfigurationVersionDetailPage() {
  const { t } = useTranslation();
  const { configurationId = '' } = useParams();

  const query = useQuery({
    queryKey: adminKeys.configurationVersion(configurationId),
    queryFn: ({ signal }) => getAdminConfigurationVersion(configurationId, signal),
    enabled: configurationId.length > 0,
  });

  if (query.isPending) {
    return <PageState kind="loading" />;
  }

  if (query.isError || !query.data) {
    return (
      <PageState
        kind="error"
        description={query.isError ? describeApiError(query.error) : undefined}
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }

  const version = query.data;

  return (
    <AdminPageContainer maw={1080}>
      <Breadcrumbs>
        <Anchor component={Link} to="/admin/configuration-versions" size="sm">
          {t('admin.configVersions.title')}
        </Anchor>
        <Anchor size="sm">v{version.version}</Anchor>
      </Breadcrumbs>

      <AccountPageHeader
        title={t('admin.configVersions.detailTitle', { version: version.version })}
      />

      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <SectionCard title={t('admin.configVersions.metaCard')}>
            <Stack gap="xs">
              <InfoItem label={t('admin.configVersions.colDescription')}>
                {version.description ?? '—'}
              </InfoItem>
              <InfoItem label={t('admin.configVersions.colCreatedBy')}>
                {version.created_by}
              </InfoItem>
              <InfoItem label={t('admin.configVersions.colCreatedAt')}>
                {formatDateTime(version.created_at)}
              </InfoItem>
              <InfoItem label={t('common.requestId')}>{version.id}</InfoItem>
            </Stack>
          </SectionCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <SectionCard title={t('admin.configVersions.documentCard')}>
            <Code block style={{ maxHeight: 520, overflow: 'auto' }}>
              {JSON.stringify(version.document, null, 2)}
            </Code>
          </SectionCard>
        </Grid.Col>
      </Grid>
    </AdminPageContainer>
  );
}
