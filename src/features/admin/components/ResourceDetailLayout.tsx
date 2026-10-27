import { Alert, Anchor, Badge, Breadcrumbs, Button, Group, Tabs, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { AccountPageHeader } from '@/components/AccountSections';

import { AdminPageContainer } from './AdminPageShell';
import { AdminStatusBadge } from './AdminStatusBadge';
import { ApplicationTypeBadge } from './resource/ApplicationTypeCard';
import type { ResourceDetailContextValue } from './resource/resourceTypes';

interface TabItem {
  value: string;
  label: string;
  badgeCount?: number;
}

export function ResourceDetailLayout({ context }: { context: ResourceDetailContextValue }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    kind,
    resource,
    canWrite,
    approvable,
    rootType,
    parentApplication,
    parentApplicationId,
    activationBlocked,
    requestActivation,
  } = context;

  const pendingCount = (resource.change_requests ?? []).filter(
    (item) => item.status === 'pending',
  ).length;

  const tabs: TabItem[] =
    kind === 'application'
      ? [
          { value: 'overview', label: t('admin.resourceTabs.overview') },
          { value: 'protocols', label: t('admin.resourceTabs.protocols') },
          { value: 'access', label: t('admin.resourceTabs.access') },
          {
            value: 'activity',
            label: t('admin.resourceTabs.activity'),
            badgeCount: pendingCount,
          },
        ]
      : [
          { value: 'overview', label: t('admin.resourceTabs.overview') },
          { value: 'settings', label: t('admin.resourceTabs.settings') },
          { value: 'integration', label: t('admin.resourceTabs.integration') },
          {
            value: 'activity',
            label: t('admin.resourceTabs.activity'),
            badgeCount: pendingCount,
          },
        ];

  const segments = location.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? 'overview';
  const activeTab = tabs.some((tab) => tab.value === lastSegment) ? lastSegment : 'overview';

  const breadcrumbs = [
    ...(kind === 'federation'
      ? [{ to: '/admin/federation-providers', label: t('admin.resources.federation.title') }]
      : [{ to: '/admin/applications', label: t('admin.resources.application.title') }]),
    ...(parentApplicationId
      ? [
          {
            to: `/admin/applications/${encodeURIComponent(parentApplicationId)}/overview`,
            label: parentApplication?.display_name ?? parentApplicationId,
          },
        ]
      : []),
    { to: '', label: resource.display_name },
  ];

  return (
    <AdminPageContainer maw={1080}>
      <Breadcrumbs>
        {breadcrumbs.map((crumb, index) =>
          crumb.to ? (
            <Anchor key={`${crumb.to}-${index}`} component={Link} to={crumb.to} size="sm">
              {crumb.label}
            </Anchor>
          ) : (
            <Anchor key={`current-${index}`} size="sm">
              {crumb.label}
            </Anchor>
          ),
        )}
      </Breadcrumbs>

      <AccountPageHeader
        title={resource.display_name}
        subtitle={
          <Group gap="sm" wrap="wrap">
            <AdminStatusBadge status={resource.status} />
            {kind === 'application' && <ApplicationTypeBadge value={rootType} />}
            <span>{resource.id}</span>
            {resource.client_id && (
              <span>
                client_id: <code>{resource.client_id}</code>
              </span>
            )}
          </Group>
        }
        actions={
          <>
            {parentApplicationId && (
              <Button
                component={Link}
                to={`/admin/applications/${encodeURIComponent(parentApplicationId)}/protocols`}
                size="xs"
                variant="default"
              >
                {t('admin.resources.backToApplication')}
              </Button>
            )}
            {approvable &&
              canWrite &&
              (resource.status === 'active' ? (
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  disabled={activationBlocked}
                  onClick={() => requestActivation('deactivate')}
                >
                  {t('admin.resources.requestDeactivate')}
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="light"
                  disabled={activationBlocked}
                  onClick={() => requestActivation('activate')}
                >
                  {t('admin.resources.requestActivate')}
                </Button>
              ))}
          </>
        }
      />

      {approvable && canWrite && activationBlocked && (
        <Alert color="yellow" variant="light">
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Text size="sm">{t('admin.resources.activationPendingHint')}</Text>
            <Anchor component={Link} to="activity" size="sm">
              {t('admin.resourceTabs.activity')}
            </Anchor>
          </Group>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onChange={(next) => {
          if (next) {
            navigate(next);
          }
        }}
      >
        <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              rightSection={
                tab.badgeCount && tab.badgeCount > 0 ? (
                  <Badge size="xs" variant="light" color="yellow">
                    {tab.badgeCount}
                  </Badge>
                ) : undefined
              }
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Outlet context={context} />
    </AdminPageContainer>
  );
}
