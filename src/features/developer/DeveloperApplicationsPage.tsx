import { Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { listDeveloperApplications } from '@/api/endpoints/permissions';
import { AccountPageHeader, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { PermissionCatalog } from '@/features/permissions/PermissionCatalog';
import { queryKeys } from '@/features/session/keys';
import { useStepUp } from '@/features/step-up/useStepUp';
import { describeApiError } from '@/i18n/errors';

function useDeveloperApplications() {
  return useQuery({
    queryKey: queryKeys.developerApplications,
    queryFn: ({ signal }) => listDeveloperApplications(signal),
  });
}

export function DeveloperApplicationsPage() {
  const { t } = useTranslation();
  const query = useDeveloperApplications();
  return (
    <Stack gap="lg" maw={960}>
      <AccountPageHeader
        title={t('authorization.developerTitle')}
        subtitle={t('authorization.developerHint')}
      />
      {query.isPending ? (
        <PageState kind="loading" />
      ) : query.isError ? (
        <PageState
          kind="error"
          error={query.error}
          description={describeApiError(query.error)}
          onRetry={() => query.refetch()}
        />
      ) : !query.data.items.length ? (
        <PageState kind="empty" title={t('authorization.noApplications')} />
      ) : (
        query.data.items.map((application) => (
          <SectionCard key={application.id} title={application.display_name}>
            <Stack gap="xs">
              <Group>
                <Text size="sm">{application.id}</Text>
                <Badge>
                  {t(`admin.status.${application.status}`, { defaultValue: application.status })}
                </Badge>
              </Group>
              <Anchor
                component={Link}
                to={`/account/developer/${encodeURIComponent(application.id)}/permissions`}
              >
                {t('authorization.catalogTitle')}
              </Anchor>
            </Stack>
          </SectionCard>
        ))
      )}
    </Stack>
  );
}

export function DeveloperPermissionsPage() {
  const { t } = useTranslation();
  const { applicationId = '' } = useParams();
  const query = useDeveloperApplications();
  const { runWithStepUp } = useStepUp();
  const application = query.data?.items.find((item) => item.id === applicationId);
  if (query.isPending) return <PageState kind="loading" />;
  if (query.isError)
    return (
      <PageState
        kind="error"
        error={query.error}
        description={describeApiError(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  return (
    <Stack gap="lg" maw={960}>
      <Anchor component={Link} to="/account/developer">
        {t('authorization.developerTitle')}
      </Anchor>
      {application ? (
        <>
          <AccountPageHeader
            title={application.display_name}
            subtitle={t('authorization.developerHint')}
          />
          <PermissionCatalog
            key={applicationId}
            scope="account"
            applicationId={applicationId}
            canWrite
            runProtected={(action) => runWithStepUp(action, { requireVerification: true })}
          />
        </>
      ) : (
        <PageState kind="empty" title={t('authorization.notOwned')} />
      )}
    </Stack>
  );
}
