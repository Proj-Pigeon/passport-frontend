import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Collapse,
  Divider,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router';

import type {
  AdminApprovableKind,
  AdminChangeRequest,
  AdminResourceKind,
  AdminResourceView,
} from '@/api/endpoints/admin/types';
import {
  decideAdminApproval,
  getAdminResource,
  patchAdminResource,
  requestAdminActivation,
} from '@/api/endpoints/admin/resources';
import { isApiError } from '@/api/errors';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';
import {
  FederationChecklistCard,
  UpstreamSpGuideCard,
} from '@/features/admin/federation/FederationChecklistCard';
import { FederationConnectionCard } from '@/features/admin/federation/FederationConnectionCard';
import { FederationScopesCard } from '@/features/admin/federation/FederationScopesCard';
import { FederationCredentialsCard } from '@/features/admin/federation/FederationCredentialsCard';
import {
  OidcConnectivityGuideCard,
  SamlConnectivityGuideCard,
} from '@/features/admin/guides/ConnectivityGuideCards';

import { AdminPermissionCatalog } from '../components/AdminPermissionCatalog';
import { ResourceServersCard } from '../components/ResourceServersCard';
import { adminKeys } from '../keys';
import { ChangeRequestsCard } from '../components/ChangeRequestsCard';
import { JsonConfigEditor } from '../components/JsonConfigEditor';
import { ReasonModal } from '../components/ReasonModal';
import { ResourceDetailLayout } from '../components/ResourceDetailLayout';
import { ApplicationTypeSection } from '../components/resource/ApplicationTypeCard';
import { ApplicationBrandingCard } from '../components/resource/ApplicationBrandingCard';
import { applicationType, sessionDurationDays } from '../components/resource/applicationPresets';
import { ApplicationProtocolCard } from '../components/resource/ApplicationProtocolCard';
import {
  OauthClientSections,
  OauthSecretRedeemBanner,
} from '../components/resource/OauthClientSections';
import { SamlProviderSections } from '../components/resource/SamlProviderSections';
import { MetadataImportCard } from '../components/resource/MetadataImportCard';
import type {
  ResourceDetailContextValue,
  ResourceSectionProps,
} from '../components/resource/resourceTypes';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

export type { ResourceSectionProps };

function configText(configuration: Record<string, unknown>, key: string): string {
  const value = configuration[key];
  return typeof value === 'string' ? value : '';
}

function federationEndpointsConfigured(resource: AdminResourceView): boolean {
  const { configuration } = resource;
  const issuer = configText(configuration, 'issuer') !== '';
  const authorization = configText(configuration, 'authorization_endpoint') !== '';
  const token = configText(configuration, 'token_endpoint') !== '';

  switch (configText(configuration, 'provider_type')) {
    case 'saml':
      return issuer && authorization;
    case 'oauth2':
      return authorization && token;
    default:
      return issuer && authorization && token && configText(configuration, 'jwks_uri') !== '';
  }
}

function useAdminResourceQuery(kind: AdminResourceKind, resourceId: string) {
  return useQuery({
    queryKey: adminKeys.resource(kind, resourceId),
    queryFn: ({ signal }) => getAdminResource(kind, resourceId, signal),
    enabled: resourceId.length > 0,
  });
}

export function AdminResourceSectionRedirect() {
  const location = useLocation();
  return (
    <Navigate to={{ pathname: 'overview', search: location.search, hash: location.hash }} replace />
  );
}

export function AdminResourceDetailPage({ kind }: { kind: AdminResourceKind }) {
  const { resourceId = '' } = useParams();
  const query = useAdminResourceQuery(kind, resourceId);

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

  return <AdminResourceDetail kind={kind} resourceId={resourceId} data={query.data} />;
}

interface AdminResourceDetailProps {
  kind: AdminResourceKind;
  resourceId: string;
  data: { resource: ResourceSectionProps['resource']; etag: string };
}

function AdminResourceDetail({ kind, resourceId, data }: AdminResourceDetailProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useAdminSession();
  const stepUp = useAdminStepUp();
  const resource = data.resource;
  const parentApplicationId =
    kind === 'oauth' || kind === 'saml' ? (resource.application_id ?? null) : null;
  const parentQuery = useQuery({
    queryKey: adminKeys.resource('application', parentApplicationId ?? ''),
    queryFn: ({ signal }) => getAdminResource('application', parentApplicationId ?? '', signal),
    enabled: parentApplicationId !== null,
  });

  const rootType = applicationType(resource.configuration['application_type']);
  const isDevice = parentQuery.data?.resource.configuration['application_type'] === 'device';

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: adminKeys.resource(kind, resourceId) });
  };

  const [pendingDecision, setPendingDecision] = useState<{
    request: AdminChangeRequest;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [activationModal, setActivationModal] = useState<'activate' | 'deactivate' | null>(null);

  const writeCapability = kind === 'federation' ? 'federation:write' : 'applications:write';
  const canWrite = hasAdminCapability(session, writeCapability);
  const canApprove = hasAdminCapability(session, 'applications:approve');
  const approvable = kind === 'application' || kind === 'federation';
  const pendingChangeActions = new Set(
    (resource.change_requests ?? [])
      .filter((request) => request.status === 'pending')
      .map((request) => request.action),
  );
  const lifecycleAction = resource.status === 'active' ? 'deactivate' : 'activate';
  const lifecycleBlocked = approvable && pendingChangeActions.has(lifecycleAction);

  const configMutation = useMutation({
    mutationFn: async (input: { reason: string; configuration: Record<string, unknown> }) =>
      stepUp.runWithAdminStepUp(() => patchAdminResource(kind, resourceId, input, data.etag)),
    onSuccess: async (result) => {
      if (result.change_request_id) {
        notifications.show({
          color: 'teal',
          message: t(
            result.change_request_status === 'pending'
              ? 'admin.resources.changeSubmitted'
              : 'admin.resources.changeAutoApproved',
          ),
        });
      }
      await refresh();
    },
  });

  const activationMutation = useMutation({
    mutationFn: async (input: { action: 'activate' | 'deactivate'; reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        requestAdminActivation(kind as AdminApprovableKind, resourceId, input, data.etag),
      ),
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

  const decisionMutation = useMutation({
    mutationFn: async (input: {
      change_request_id: string;
      decision: 'approve' | 'reject';
      reason: string;
    }) =>
      stepUp.runWithAdminStepUp(() =>
        decideAdminApproval(
          kind === 'oauth' || kind === 'saml' ? 'application' : (kind as AdminApprovableKind),
          resourceId,
          input,
          data.etag,
        ),
      ),
    onSuccess: async () => {
      setPendingDecision(null);
      await refresh();
    },
  });

  const contextValue: ResourceDetailContextValue = {
    kind,
    resourceId,
    resource,
    etag: data.etag,
    refresh,
    canWrite,
    canApprove,
    approvable,
    rootType,
    isDevice,
    parentApplication: parentQuery.data?.resource ?? null,
    parentApplicationId,
    activationPending: activationMutation.isPending,
    activationBlocked: lifecycleBlocked,
    requestActivation: (action) => {
      activationMutation.reset();
      setActivationModal(action);
    },
    configPending: configMutation.isPending,
    configError: configMutation.error,
    configSubmittedPending:
      Boolean(configMutation.data?.change_request_id) &&
      configMutation.data?.change_request_status === 'pending',
    saveConfig: (reason, configuration) => configMutation.mutate({ reason, configuration }),
    decisionPending: decisionMutation.isPending,
    decisionError: decisionMutation.error,
    openDecision: (request, decision) => {
      decisionMutation.reset();
      setPendingDecision({ request, decision });
    },
  };

  return (
    <>
      <ResourceDetailLayout context={contextValue} />

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
        onSubmit={(reason) => {
          if (activationModal) {
            activationMutation.mutate({ action: activationModal, reason });
          }
        }}
      />

      <ReasonModal
        opened={pendingDecision !== null}
        onClose={() => (decisionMutation.isPending ? undefined : setPendingDecision(null))}
        title={
          pendingDecision
            ? pendingDecision.decision === 'approve'
              ? t('admin.approval.approveTitle')
              : t('admin.approval.rejectTitle')
            : ''
        }
        description={
          pendingDecision
            ? [
                t(`admin.changeAction.${pendingDecision.request.action}`),
                pendingDecision.request.reason,
              ]
                .filter(Boolean)
                .join(' · ')
            : ''
        }
        confirmLabel={
          pendingDecision
            ? pendingDecision.decision === 'approve'
              ? t('admin.approval.approve')
              : t('admin.approval.reject')
            : ''
        }
        confirmColor={pendingDecision?.decision === 'reject' ? 'red' : undefined}
        pending={decisionMutation.isPending}
        error={decisionMutation.error}
        errorHint={
          isApiError(decisionMutation.error) && decisionMutation.error.status === 409
            ? t('admin.approval.staleHint')
            : undefined
        }
        onSubmit={(reason) => {
          if (pendingDecision) {
            decisionMutation.mutate({
              change_request_id: pendingDecision.request.id,
              decision: pendingDecision.decision,
              reason,
            });
          }
        }}
      />
    </>
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

export function AdminResourceOverviewSubpage() {
  const { t } = useTranslation();
  const context = useOutletContext<ResourceDetailContextValue>();
  const {
    kind,
    resource,
    etag,
    refresh,
    canWrite,
    approvable,
    parentApplication,
    parentApplicationId,
    activationPending,
    activationBlocked,
    requestActivation,
  } = context;
  const sectionProps: ResourceSectionProps = { resource, etag, refresh, canWrite };

  if (kind === 'application') {
    const pendingCount = (resource.change_requests ?? []).filter(
      (item) => item.status === 'pending',
    ).length;
    return (
      <Stack gap="lg">
        <Grid>
          <Grid.Col span={{ base: 12, md: 7 }}>
            <ApplicationBrandingCard {...sectionProps} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <SectionCard title={t('admin.resources.infoCard')}>
              <Stack gap="md">
                <ResourceInfoGrid resource={resource} />
                <Divider />
                <ApplicationTypeSection {...sectionProps} />
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

  if (kind === 'federation') {
    const providerType = configText(resource.configuration, 'provider_type');
    return (
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SectionCard title={t('admin.resources.infoCard')}>
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <InfoItem label={t('admin.federation.field.provider_type')}>
                  {providerType ? providerType.toUpperCase() : '—'}
                </InfoItem>
                <InfoItem label={t('admin.federation.field.slug')}>
                  {configText(resource.configuration, 'slug') || '—'}
                </InfoItem>
              </SimpleGrid>
              <Divider />
              <ResourceInfoGrid resource={resource} />
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
        <Grid.Col span={{ base: 12, md: 6 }}>
          <FederationChecklistCard
            isSaml={providerType === 'saml'}
            secretConfigured={resource.secret_set === true}
            secretRefConfigured={
              configText(resource.configuration, 'client_secret_ref').trim() !== ''
            }
            clientIdConfigured={configText(resource.configuration, 'client_id').trim() !== ''}
            endpointsConfigured={federationEndpointsConfigured(resource)}
            discoveryAvailable={providerType === 'oidc'}
            certificatesConfigured={
              providerType === 'saml' &&
              Array.isArray(resource.configuration['signing_certificates']) &&
              (resource.configuration['signing_certificates'] as unknown[]).length > 0
            }
            canRequestActivation={approvable && Boolean(canWrite)}
            onRequestActivation={() => requestActivation('activate')}
            activationPending={activationPending}
            activationBlocked={activationBlocked}
          />
        </Grid.Col>
      </Grid>
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
        <OauthSecretRedeemBanner resource={resource} etag={etag} refresh={refresh} />
        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SectionCard title={t('admin.resources.infoCard')}>
              <Stack gap="md">
                {parentApplicationId && (
                  <InfoItem label={t('admin.resources.parentApplication')}>
                    <Anchor
                      component={Link}
                      to={`/admin/applications/${encodeURIComponent(parentApplicationId)}/overview`}
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
  const spEntityId = configText(resource.configuration, 'sp_entity_id');

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SectionCard title={t('admin.resources.infoCard')}>
          <Stack gap="md">
            {parentApplicationId && (
              <InfoItem label={t('admin.resources.parentApplication')}>
                <Anchor
                  component={Link}
                  to={`/admin/applications/${encodeURIComponent(parentApplicationId)}/overview`}
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

export function AdminResourceProtocolsSubpage() {
  const { resource, rootType } = useOutletContext<ResourceDetailContextValue>();
  return (
    <Stack gap="lg">
      <ApplicationProtocolCard
        kind="oauth"
        applicationId={resource.id}
        applicationType={rootType}
      />
      <ApplicationProtocolCard kind="saml" applicationId={resource.id} applicationType={rootType} />
    </Stack>
  );
}

export function AdminResourceAccessSubpage() {
  const { resource } = useOutletContext<ResourceDetailContextValue>();
  return (
    <Stack gap="lg">
      <AdminPermissionCatalog key={`permissions-${resource.id}`} applicationId={resource.id} />
      <ResourceServersCard key={`servers-${resource.id}`} applicationId={resource.id} />
    </Stack>
  );
}

export function AdminResourceSettingsSubpage() {
  const context = useOutletContext<ResourceDetailContextValue>();
  const { kind, resource, etag, refresh, canWrite, isDevice } = context;
  const sectionProps: ResourceSectionProps = { resource, etag, refresh, canWrite };

  if (kind === 'oauth') {
    return (
      <Stack gap="lg">
        <OauthClientSections {...sectionProps} device={isDevice} />
      </Stack>
    );
  }

  if (kind === 'saml') {
    return (
      <Stack gap="lg">
        <SamlProviderSections {...sectionProps} />
        {canWrite && <MetadataImportCard kind="saml" {...sectionProps} />}
      </Stack>
    );
  }

  if (kind === 'federation') {
    return (
      <Stack gap="lg">
        <FederationConnectionCard key={`connection-${etag}`} {...sectionProps} />
        <FederationCredentialsCard key={`credentials-${etag}`} {...sectionProps} />
        <FederationScopesCard key={`scopes-${etag}`} {...sectionProps} />
        {canWrite && <MetadataImportCard kind="federation" {...sectionProps} />}
      </Stack>
    );
  }

  return null;
}

export function AdminResourceIntegrationSubpage() {
  const { t } = useTranslation();
  const context = useOutletContext<ResourceDetailContextValue>();
  const {
    kind,
    resource,
    etag,
    canWrite,
    isDevice,
    configPending,
    configError,
    configSubmittedPending,
    saveConfig,
  } = context;
  const [advancedOpen, setAdvancedOpen] = useState(kind !== 'federation');

  return (
    <Stack gap="lg">
      {kind === 'oauth' && !isDevice && (
        <OidcConnectivityGuideCard
          clientId={resource.client_id}
          scopes={resource.configuration['allowed_scopes']}
        />
      )}
      {kind === 'oauth' && isDevice && (
        <SectionCard title={t('devices.authorizeTitle')}>
          <Text size="sm">{t('devices.integrationHint')}</Text>
        </SectionCard>
      )}
      {kind === 'saml' && <SamlConnectivityGuideCard configuration={resource.configuration} />}
      {kind === 'federation' && (
        <UpstreamSpGuideCard
          spEntityId={resource.sp_entity_id}
          spAcsUrl={resource.sp_acs_url}
          spMetadataUrl={resource.sp_metadata_url}
          spCertificatePem={resource.sp_certificate_pem}
          spCertificateFingerprint={resource.sp_certificate_fingerprint}
        />
      )}

      {(kind === 'oauth' || kind === 'saml' || (kind === 'federation' && canWrite)) && (
        <SectionCard
          title={
            kind === 'federation'
              ? t('admin.federation.advancedCard')
              : t('admin.resources.configCard')
          }
          description={
            kind === 'federation'
              ? t('admin.federation.advancedHint')
              : t(
                  resource.status === 'active'
                    ? 'admin.resources.configChangeRequest'
                    : 'admin.resources.configImmediate',
                )
          }
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
                {configSubmittedPending && (
                  <Alert color="green" variant="light">
                    {t('admin.resources.changeSubmitted')}
                  </Alert>
                )}
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
      )}
    </Stack>
  );
}

export function AdminResourceActivitySubpage() {
  const { t } = useTranslation();
  const { resource, canApprove, decisionPending, decisionError, openDecision } =
    useOutletContext<ResourceDetailContextValue>();

  return (
    <Stack gap="lg">
      <ChangeRequestsCard
        requests={resource.change_requests ?? []}
        canDecide={canApprove}
        decisionPending={decisionPending}
        decisionError={decisionError}
        showEmpty
        onDecide={openDecision}
      />

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
