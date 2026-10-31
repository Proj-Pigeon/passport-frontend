import {
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Code,
  Collapse,
  Divider,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';

import type { AdminResourceInput, AdminResourceView } from '@/api/endpoints/admin/types';
import {
  getDeveloperProtocolInfo,
  getDeveloperResource,
  patchDeveloperResource,
  requestDeveloperActivation,
  type DeveloperResourceKind,
} from '@/api/endpoints/developer/resources';
import { isApiError } from '@/api/errors';
import { AccountPageHeader, InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';
import {
  OidcConnectivityGuideCard,
  SamlConnectivityGuideCard,
} from '@/features/admin/guides/ConnectivityGuideCards';
import { AdminStatusBadge } from '@/features/admin/components/AdminStatusBadge';
import { ChangeRequestsCard } from '@/features/admin/components/ChangeRequestsCard';
import { JsonConfigEditor } from '@/features/admin/components/JsonConfigEditor';
import { ReasonModal } from '@/features/admin/components/ReasonModal';
import { ApplicationTypeBadge } from '@/features/admin/components/resource/ApplicationTypeCard';
import {
  applicationType,
  sessionDurationDays,
} from '@/features/admin/components/resource/applicationPresets';
import { PermissionCatalog } from '@/features/permissions/PermissionCatalog';
import { useStepUp } from '@/features/step-up/useStepUp';

import { developerPanelKeys } from '../keys';
import { DeveloperApplicationLogoUploader } from './DeveloperApplicationLogoUploader';
import type { DeveloperDetailContextValue, DeveloperSectionProps } from './developerTypes';
import { DeveloperProtocolSettingsCard } from './DeveloperProtocolSettingsCard';
import {
  DeveloperMetadataImportCard,
  DeveloperOauthSecretRedeemBanner,
  DeveloperOauthSections,
  DeveloperProtocolCard,
  DeveloperSamlSections,
} from './DeveloperProtocolSections';

export type { DeveloperSectionProps };

const developerProtocolInfoSource = {
  queryKey: developerPanelKeys.protocolInfo,
  getProtocolInfo: getDeveloperProtocolInfo,
};

function configText(configuration: Record<string, unknown>, key: string): string {
  const value = configuration[key];
  return typeof value === 'string' ? value : '';
}

function useDeveloperResourceQuery(kind: DeveloperResourceKind, resourceId: string) {
  return useQuery({
    queryKey: developerPanelKeys.resource(kind, resourceId),
    queryFn: ({ signal }) => getDeveloperResource(kind, resourceId, signal),
    enabled: resourceId.length > 0,
  });
}

export function DeveloperResourceSectionRedirect() {
  const location = useLocation();
  return (
    <Navigate to={{ pathname: 'overview', search: location.search, hash: location.hash }} replace />
  );
}

export function DeveloperResourceDetailPage({ kind }: { kind: DeveloperResourceKind }) {
  const { resourceId = '' } = useParams();
  const query = useDeveloperResourceQuery(kind, resourceId);

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

  return <DeveloperResourceDetail kind={kind} resourceId={resourceId} data={query.data} />;
}

function DeveloperResourceDetail({
  kind,
  resourceId,
  data,
}: {
  kind: DeveloperResourceKind;
  resourceId: string;
  data: { resource: AdminResourceView; etag: string };
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const stepUp = useStepUp();
  const resource = data.resource;
  const parentApplicationId =
    kind === 'oauth' || kind === 'saml' ? (resource.application_id ?? null) : null;
  const parentQuery = useQuery({
    queryKey: developerPanelKeys.resource('application', parentApplicationId ?? ''),
    queryFn: ({ signal }) => getDeveloperResource('application', parentApplicationId ?? '', signal),
    enabled: parentApplicationId !== null,
  });

  const rootType = applicationType(resource.configuration['application_type']);
  const isDevice = parentQuery.data?.resource.configuration['application_type'] === 'device';

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: developerPanelKeys.resource(kind, resourceId),
      }),
      queryClient.invalidateQueries({
        queryKey: developerPanelKeys.resourceKind(kind),
      }),
      queryClient.invalidateQueries({
        queryKey: developerPanelKeys.resourceKind('application'),
      }),
    ]);
  };

  const [activationModal, setActivationModal] = useState<'activate' | 'deactivate' | null>(null);

  // Developer endpoints already enforce the developer role server-side.
  const canWrite = true;
  const approvable = true;

  const configMutation = useMutation({
    mutationFn: async (input: { configuration: Record<string, unknown> }) =>
      stepUp.runWithStepUp(() => patchDeveloperResource(kind, resourceId, input, data.etag), {
        requireVerification: true,
      }),
    onSuccess: async (result) => {
      if (result.change_request_id) {
        notifications.show({
          color: 'teal',
          message: t('admin.resources.changeAutoApproved'),
        });
      }
      await refresh();
    },
  });

  const activationMutation = useMutation({
    mutationFn: async (input: { action: 'activate' | 'deactivate' }) =>
      stepUp.runWithStepUp(() => requestDeveloperActivation(kind, resourceId, input, data.etag), {
        requireVerification: true,
      }),
    onSuccess: async (result) => {
      setActivationModal(null);
      notifications.show({
        color: 'teal',
        message: t(
          result.status === 'pending'
            ? 'admin.resources.activationSubmitted'
            : 'admin.resources.activationAutoApproved',
        ),
      });
      await refresh();
    },
  });

  const contextValue: DeveloperDetailContextValue = {
    kind,
    resourceId,
    resource,
    etag: data.etag,
    refresh,
    canWrite,
    approvable,
    rootType,
    isDevice,
    parentApplication: parentQuery.data?.resource ?? null,
    parentApplicationId,
    requestActivation: (action) => {
      activationMutation.reset();
      setActivationModal(action);
    },
    configPending: configMutation.isPending,
    configError: configMutation.error,
    saveConfig: (configuration) => configMutation.mutate({ configuration }),
  };

  return (
    <>
      <DeveloperResourceDetailLayout context={contextValue} />

      <ReasonModal
        opened={activationModal !== null}
        onClose={() => (activationMutation.isPending ? undefined : setActivationModal(null))}
        title={
          activationModal === 'deactivate'
            ? t('admin.resources.requestDeactivate')
            : t('admin.resources.requestActivate')
        }
        description={t('admin.resources.activationConfirm', { name: resource.display_name })}
        confirmLabel={t('common.submit')}
        pending={activationMutation.isPending}
        error={activationMutation.error}
        errorHint={
          isApiError(activationMutation.error) && activationMutation.error.status === 409
            ? t('admin.resources.activationConflictHint')
            : undefined
        }
        onSubmit={() => {
          if (activationModal) {
            activationMutation.mutate({ action: activationModal });
          }
        }}
      />
    </>
  );
}

export function DeveloperResourceDetailLayout({
  context,
}: {
  context: DeveloperDetailContextValue;
}) {
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
    requestActivation,
  } = context;

  const pendingCount = (resource.change_requests ?? []).filter(
    (item) => item.status === 'pending',
  ).length;

  const tabs =
    kind === 'application'
      ? [
          { value: 'overview', label: t('admin.resourceTabs.overview') },
          { value: 'protocols', label: t('admin.resourceTabs.protocols') },
          { value: 'access', label: t('admin.resourceTabs.access') },
          { value: 'activity', label: t('admin.resourceTabs.activity'), badgeCount: pendingCount },
        ]
      : [
          { value: 'overview', label: t('admin.resourceTabs.overview') },
          { value: 'settings', label: t('admin.resourceTabs.settings') },
          { value: 'integration', label: t('admin.resourceTabs.integration') },
          { value: 'activity', label: t('admin.resourceTabs.activity'), badgeCount: pendingCount },
        ];

  const segments = location.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? 'overview';
  const activeTab = tabs.some((tab) => tab.value === lastSegment) ? lastSegment : 'overview';

  const breadcrumbs = [
    { to: '/account/developer', label: t('developer.panel.title') },
    ...(parentApplicationId
      ? [
          {
            to: `/account/developer/applications/${encodeURIComponent(parentApplicationId)}/overview`,
            label: parentApplication?.display_name ?? parentApplicationId,
          },
        ]
      : []),
    { to: '', label: resource.display_name },
  ];

  return (
    <Stack gap="lg" maw={1080} style={{ minWidth: 0 }}>
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
                to={`/account/developer/applications/${encodeURIComponent(parentApplicationId)}/protocols`}
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
                  onClick={() => requestActivation('deactivate')}
                >
                  {t('admin.resources.requestDeactivate')}
                </Button>
              ) : (
                <Button size="xs" variant="light" onClick={() => requestActivation('activate')}>
                  {t('admin.resources.requestActivate')}
                </Button>
              ))}
          </>
        }
      />

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
    </Stack>
  );
}

function ResourceInfoGrid({ resource }: { resource: AdminResourceView }) {
  const { t } = useTranslation();
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <InfoItem label={t('admin.resources.colVersion')}>{resource.version}</InfoItem>
      <InfoItem label={t('admin.resources.configurationVersionId')}>
        {resource.configuration_version_id ? (
          <Tooltip
            label={resource.configuration_version_id}
            withArrow
            events={{ hover: true, focus: true, touch: false }}
          >
            <Text truncate="end" tabIndex={0}>
              {resource.configuration_version_id}
            </Text>
          </Tooltip>
        ) : (
          '—'
        )}
      </InfoItem>
      <InfoItem label={t('admin.resources.colCreatedAt')}>
        {formatDateTime(resource.created_at)}
      </InfoItem>
      <InfoItem label={t('admin.resources.colUpdatedAt')}>
        {formatDateTime(resource.updated_at)}
      </InfoItem>
    </SimpleGrid>
  );
}

export function DeveloperBrandingCard({
  resource,
  etag,
  refresh,
  canWrite,
}: DeveloperSectionProps) {
  const { t } = useTranslation();
  const stepUp = useStepUp();
  const currentDescription = configText(resource.configuration, 'description');
  const currentDeveloperName = configText(resource.configuration, 'developer_name');
  const currentDeveloperUrl = configText(resource.configuration, 'developer_url');
  const [displayName, setDisplayName] = useState(resource.display_name);
  const [description, setDescription] = useState(currentDescription);
  const [developerName, setDeveloperName] = useState(currentDeveloperName);
  const [developerUrl, setDeveloperUrl] = useState(currentDeveloperUrl);
  const [saveModal, setSaveModal] = useState(false);

  const nameError = !displayName.trim() || [...displayName.trim()].length > 80;
  const descriptionError = new TextEncoder().encode(description.trim()).length > 2000;
  const developerNameError = [...developerName.trim()].length > 160;
  const urlError = !validDeveloperUrl(developerUrl.trim()) || developerUrl.trim().length > 2048;
  const invalid = nameError || descriptionError || developerNameError || urlError;
  const dirty =
    displayName.trim() !== resource.display_name ||
    description.trim() !== currentDescription ||
    developerName.trim() !== currentDeveloperName ||
    developerUrl.trim() !== currentDeveloperUrl;

  const saveMutation = useMutation({
    mutationFn: (input: AdminResourceInput) =>
      stepUp.runWithStepUp(() => patchDeveloperResource('application', resource.id, input, etag), {
        requireVerification: true,
      }),
    onSuccess: async () => {
      setSaveModal(false);
      await refresh();
    },
  });

  const openEditModal = () => {
    setDisplayName(resource.display_name);
    setDescription(currentDescription);
    setDeveloperName(currentDeveloperName);
    setDeveloperUrl(currentDeveloperUrl);
    saveMutation.reset();
    setSaveModal(true);
  };

  return (
    <SectionCard
      title={t('developer.details.card')}
      description={t('developer.details.hint')}
      action={
        canWrite ? (
          <Button
            size="xs"
            variant="light"
            style={{ flexShrink: 0 }}
            onClick={openEditModal}
            disabled={saveMutation.isPending}
          >
            {t('developer.details.edit')}
          </Button>
        ) : undefined
      }
    >
      <Stack gap="md">
        <DeveloperApplicationLogoUploader
          key={resource.id}
          applicationId={resource.id}
          displayName={resource.display_name}
          canWrite={canWrite}
        />
        <InfoItem label={t('developer.create.name')}>
          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
            {resource.display_name}
          </Text>
        </InfoItem>
        <InfoItem label={t('admin.applicationCreate.description')}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {currentDescription || '—'}
          </Text>
        </InfoItem>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <InfoItem label={t('admin.branding.developerName')}>
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
              {currentDeveloperName || '—'}
            </Text>
          </InfoItem>
          <InfoItem label={t('admin.branding.developerUrl')}>
            {currentDeveloperUrl ? (
              <Anchor
                href={currentDeveloperUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                style={{ wordBreak: 'break-all' }}
              >
                {currentDeveloperUrl}
              </Anchor>
            ) : (
              <Text size="sm">—</Text>
            )}
          </InfoItem>
        </SimpleGrid>
      </Stack>

      <ReasonModal
        opened={saveModal}
        onClose={() => (saveMutation.isPending ? undefined : setSaveModal(false))}
        title={t('developer.details.edit')}
        confirmLabel={t('common.submit')}
        confirmDisabled={!canWrite || !dirty || invalid}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        extraFields={
          <Stack gap="sm">
            <TextInput
              label={t('developer.create.name')}
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              error={nameError ? t('admin.applicationCreate.invalid') : undefined}
              disabled={saveMutation.isPending}
              required
              data-autofocus
            />
            <Textarea
              label={t('admin.applicationCreate.description')}
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              error={descriptionError ? t('admin.applicationCreate.invalid') : undefined}
              disabled={saveMutation.isPending}
              autosize
              minRows={2}
              maxRows={6}
            />
            <TextInput
              label={t('admin.branding.developerName')}
              value={developerName}
              onChange={(event) => setDeveloperName(event.currentTarget.value)}
              error={developerNameError ? t('admin.applicationCreate.invalid') : undefined}
              disabled={saveMutation.isPending}
            />
            <TextInput
              label={t('admin.branding.developerUrl')}
              value={developerUrl}
              onChange={(event) => setDeveloperUrl(event.currentTarget.value)}
              placeholder="https://developer.example.com"
              maxLength={2048}
              error={urlError ? t('admin.branding.invalidUrl') : undefined}
              disabled={saveMutation.isPending}
            />
          </Stack>
        }
        onSubmit={() => {
          if (!canWrite || !dirty || invalid || saveMutation.isPending) return;
          saveMutation.mutate({
            configuration: {
              display_name: displayName.trim(),
              description: description.trim(),
              developer_name: developerName.trim(),
              developer_url: developerUrl.trim(),
            },
          });
        }}
      />
    </SectionCard>
  );
}

function validDeveloperUrl(value: string): boolean {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '';
  } catch {
    return false;
  }
}

export function DeveloperResourceOverviewSubpage() {
  const { t } = useTranslation();
  const context = useOutletContext<DeveloperDetailContextValue>();
  const { kind, resource, etag, refresh, canWrite, parentApplication, parentApplicationId } =
    context;
  const sectionProps: DeveloperSectionProps = { resource, etag, refresh, canWrite };

  if (kind === 'application') {
    const pendingCount = (resource.change_requests ?? []).filter(
      (item) => item.status === 'pending',
    ).length;
    return (
      <Stack gap="lg">
        <Grid>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <DeveloperBrandingCard {...sectionProps} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <SectionCard title={t('admin.resources.infoCard')}>
              <Stack gap="md">
                <ResourceInfoGrid resource={resource} />
                <Divider />
                <Group gap="xs">
                  <ApplicationTypeBadge value={resource.configuration['application_type']} />
                  <Text size="xs" c="dimmed">
                    {t('admin.resources.colVersion')}: {resource.version}
                  </Text>
                </Group>
              </Stack>
            </SectionCard>
          </Grid.Col>
        </Grid>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Paper p="md">
            <Stack gap="xs" justify="space-between" h="100%">
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  {t('admin.resourceTabs.protocols')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('admin.applicationProtocols.clientsHint')}
                </Text>
              </Stack>
              <Group>
                <Button component={Link} to="../protocols" size="xs" variant="light">
                  {t('admin.resourceTabs.protocols')}
                </Button>
              </Group>
            </Stack>
          </Paper>
          <Paper p="md">
            <Stack gap="xs" justify="space-between" h="100%">
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  {t('admin.resourceTabs.access')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('authorization.serversHint')}
                </Text>
              </Stack>
              <Group>
                <Button component={Link} to="../access" size="xs" variant="light">
                  {t('admin.resourceTabs.access')}
                </Button>
              </Group>
            </Stack>
          </Paper>
          <Paper p="md">
            <Stack gap="xs" justify="space-between" h="100%">
              <Stack gap={4}>
                <Group gap="xs">
                  <Text fw={600} size="sm">
                    {t('admin.resourceTabs.activity')}
                  </Text>
                  {pendingCount > 0 && (
                    <Badge size="xs" variant="light" color="yellow">
                      {pendingCount}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {t('admin.changeRequests.description')}
                </Text>
              </Stack>
              <Group>
                <Button component={Link} to="../activity" size="xs" variant="light">
                  {t('admin.resourceTabs.activity')}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>
    );
  }

  if (kind === 'oauth') {
    const redirectCount = Array.isArray(resource.configuration['redirect_uris'])
      ? (resource.configuration['redirect_uris'] as unknown[]).length
      : 0;
    const sessionSeconds = Number(resource.configuration['refresh_token_ttl_seconds']) || 0;
    const clientType = configText(resource.configuration, 'client_type') || 'confidential';

    return (
      <Stack gap="lg">
        <DeveloperOauthSecretRedeemBanner resource={resource} etag={etag} refresh={refresh} />
        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title={t('admin.resources.infoCard')}>
              <Stack gap="md">
                {parentApplicationId && (
                  <InfoItem label={t('admin.resources.parentApplication')}>
                    <Anchor
                      component={Link}
                      to={`/account/developer/applications/${encodeURIComponent(parentApplicationId)}/overview`}
                      size="sm"
                    >
                      {parentApplication?.display_name ?? parentApplicationId}
                    </Anchor>
                  </InfoItem>
                )}
                <ResourceInfoGrid resource={resource} />
              </Stack>
            </SectionCard>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title={t('admin.resourceTabs.settings')}>
              <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <InfoItem label={t('admin.resources.colClientId')}>
                    <Code>{resource.client_id ?? '—'}</Code>
                  </InfoItem>
                  <InfoItem label={t('admin.oauth.redirectCard')}>{redirectCount}</InfoItem>
                  <InfoItem label={t('admin.oauth.sessionCard')}>
                    {sessionSeconds > 0
                      ? t('admin.oauth.sessionCurrent', {
                          hours: sessionSeconds / 3600,
                          days: sessionDurationDays(sessionSeconds),
                        })
                      : t('admin.oauth.sessionDefault')}
                  </InfoItem>
                  <InfoItem label={t('admin.applicationCreate.authMethod')}>
                    {configText(resource.configuration, 'token_endpoint_auth_method') || clientType}
                  </InfoItem>
                </SimpleGrid>
                <Group gap="xs">
                  <Button component={Link} to="../settings" size="xs" variant="light">
                    {t('admin.resourceTabs.settings')}
                  </Button>
                  <Button component={Link} to="../integration" size="xs" variant="default">
                    {t('admin.resourceTabs.integration')}
                  </Button>
                </Group>
              </Stack>
            </SectionCard>
          </Grid.Col>
        </Grid>
      </Stack>
    );
  }

  const acsCount = Array.isArray(resource.configuration['acs_urls'])
    ? (resource.configuration['acs_urls'] as unknown[]).length
    : 0;
  const certCount = Array.isArray(resource.configuration['signing_certificates'])
    ? (resource.configuration['signing_certificates'] as unknown[]).length
    : 0;
  const spEntityId = configText(resource.configuration, 'entity_id');

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SectionCard title={t('admin.resources.infoCard')}>
          <Stack gap="md">
            {parentApplicationId && (
              <InfoItem label={t('admin.resources.parentApplication')}>
                <Anchor
                  component={Link}
                  to={`/account/developer/applications/${encodeURIComponent(parentApplicationId)}/overview`}
                  size="sm"
                >
                  {parentApplication?.display_name ?? parentApplicationId}
                </Anchor>
              </InfoItem>
            )}
            <ResourceInfoGrid resource={resource} />
          </Stack>
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SectionCard title={t('admin.resourceTabs.settings')}>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <InfoItem label={t('admin.federation.spEntityId')}>
                <Code>{spEntityId || '—'}</Code>
              </InfoItem>
              <InfoItem label={t('admin.saml.acsCard')}>{acsCount}</InfoItem>
              <InfoItem label={t('admin.saml.certCard')}>{certCount}</InfoItem>
            </SimpleGrid>
            <Group gap="xs">
              <Button component={Link} to="../settings" size="xs" variant="light">
                {t('admin.resourceTabs.settings')}
              </Button>
              <Button component={Link} to="../integration" size="xs" variant="default">
                {t('admin.resourceTabs.integration')}
              </Button>
            </Group>
          </Stack>
        </SectionCard>
      </Grid.Col>
    </Grid>
  );
}

export function DeveloperResourceProtocolsSubpage() {
  const { resource, rootType } = useOutletContext<DeveloperDetailContextValue>();
  return (
    <Stack gap="lg">
      {rootType !== 'saml' && (
        <DeveloperProtocolCard
          kind="oauth"
          applicationId={resource.id}
          applicationType={rootType}
        />
      )}
      {(!rootType || rootType === 'saml') && (
        <DeveloperProtocolCard kind="saml" applicationId={resource.id} applicationType={rootType} />
      )}
    </Stack>
  );
}

export function DeveloperResourceAccessSubpage() {
  const { resource } = useOutletContext<DeveloperDetailContextValue>();
  const { runWithStepUp } = useStepUp();
  return (
    <Stack gap="lg">
      <PermissionCatalog
        key={`permissions-${resource.id}`}
        scope="account"
        applicationId={resource.id}
        canWrite
        runProtected={(action) => runWithStepUp(action, { requireVerification: true })}
      />
    </Stack>
  );
}

export function DeveloperResourceSettingsSubpage() {
  const context = useOutletContext<DeveloperDetailContextValue>();
  const { kind, resource, etag, refresh, canWrite, isDevice } = context;
  const sectionProps: DeveloperSectionProps = { resource, etag, refresh, canWrite };

  if (kind === 'oauth') {
    return (
      <Stack gap="lg">
        <DeveloperProtocolSettingsCard kind="oauth" {...sectionProps} />
        <DeveloperOauthSections {...sectionProps} device={isDevice} />
      </Stack>
    );
  }

  if (kind === 'saml') {
    return (
      <Stack gap="lg">
        <DeveloperProtocolSettingsCard kind="saml" {...sectionProps} />
        <DeveloperSamlSections {...sectionProps} />
        {canWrite && <DeveloperMetadataImportCard {...sectionProps} />}
      </Stack>
    );
  }

  return null;
}

export function DeveloperResourceIntegrationSubpage() {
  const { t } = useTranslation();
  const context = useOutletContext<DeveloperDetailContextValue>();
  const { kind, resource, etag, canWrite, isDevice, configPending, configError, saveConfig } =
    context;
  const [advancedOpen, setAdvancedOpen] = useState(true);

  return (
    <Stack gap="lg">
      {kind === 'oauth' && !isDevice && (
        <OidcConnectivityGuideCard
          clientId={resource.client_id}
          scopes={resource.configuration['allowed_scopes']}
          protocolInfoSource={developerProtocolInfoSource}
        />
      )}
      {kind === 'oauth' && isDevice && (
        <SectionCard title={t('devices.authorizeTitle')}>
          <Text size="sm">{t('devices.integrationHint')}</Text>
        </SectionCard>
      )}
      {kind === 'saml' && (
        <SamlConnectivityGuideCard
          configuration={resource.configuration}
          protocolInfoSource={developerProtocolInfoSource}
        />
      )}

      <SectionCard
        title={t('admin.resources.configCard')}
        description={t(
          resource.status === 'active'
            ? 'admin.resources.configChangeRequest'
            : 'admin.resources.configImmediate',
        )}
        action={
          canWrite ? (
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen
                ? t('admin.federation.advancedHide')
                : t('admin.federation.advancedShow')}
            </Button>
          ) : undefined
        }
      >
        {canWrite ? (
          <Collapse expanded={advancedOpen} transitionDuration={200}>
            <Stack gap="sm">
              <JsonConfigEditor
                key={etag}
                initial={resource.configuration}
                onSave={saveConfig}
                pending={configPending}
                error={configError}
              />
            </Stack>
          </Collapse>
        ) : (
          <Code block style={{ maxHeight: 360, overflow: 'auto' }}>
            {JSON.stringify(resource.configuration, null, 2)}
          </Code>
        )}
      </SectionCard>
    </Stack>
  );
}

export function DeveloperResourceActivitySubpage() {
  const { t } = useTranslation();
  const { resource } = useOutletContext<DeveloperDetailContextValue>();

  return (
    <Stack gap="lg">
      <ChangeRequestsCard requests={resource.change_requests ?? []} showEmpty />

      {resource.published_configuration && (
        <SectionCard
          title={t('admin.resources.publishedCard')}
          description={t('admin.resources.publishedHint')}
        >
          <Code block style={{ maxHeight: 360, overflow: 'auto' }}>
            {JSON.stringify(resource.published_configuration, null, 2)}
          </Code>
        </SectionCard>
      )}
    </Stack>
  );
}
