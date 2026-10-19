import {
  Alert,
  Anchor,
  Breadcrumbs,
  Button,
  Code,
  Collapse,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

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
import { AccountPageHeader, InfoItem, SectionCard } from '@/components/AccountSections';
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

import { adminKeys } from '../keys';
import { AdminStatusBadge } from '../components/AdminStatusBadge';
import { ChangeRequestsCard } from '../components/ChangeRequestsCard';
import { JsonConfigEditor } from '../components/JsonConfigEditor';
import { ReasonModal } from '../components/ReasonModal';
import {
  ApplicationTypeBadge,
  ApplicationTypeCard,
} from '../components/resource/ApplicationTypeCard';
import { applicationType } from '../components/resource/applicationPresets';
import { ApplicationProtocolCard } from '../components/resource/ApplicationProtocolCard';
import { OauthClientSections } from '../components/resource/OauthClientSections';
import { SamlProviderSections } from '../components/resource/SamlProviderSections';
import { MetadataImportCard } from '../components/resource/MetadataImportCard';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

export interface ResourceSectionProps {
  resource: AdminResourceView;
  etag: string;
  refresh: () => Promise<void>;
  canWrite?: boolean;
}

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
  const providerType = configText(resource.configuration, 'provider_type');
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const sectionProps: ResourceSectionProps = { resource, etag: data.etag, refresh };

  const breadcrumbs = [
    ...(kind === 'federation'
      ? [{ to: '/admin/federation-providers', label: t('admin.resources.federation.title') }]
      : [{ to: '/admin/applications', label: t('admin.resources.application.title') }]),
    ...(parentApplicationId
      ? [
          {
            to: `/admin/applications/${encodeURIComponent(parentApplicationId)}`,
            label: parentQuery.data?.resource.display_name ?? parentApplicationId,
          },
        ]
      : []),
    { to: '', label: resource.display_name },
  ];

  return (
    <Stack gap="lg" maw={960}>
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
          <Group gap="sm">
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
      />

      <SectionCard title={t('admin.resources.infoCard')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <InfoItem label={t('admin.resources.colVersion')}>{resource.version}</InfoItem>
          <InfoItem label={t('admin.resources.configurationVersionId')}>
            {resource.configuration_version_id ?? '—'}
          </InfoItem>
          <InfoItem label={t('admin.resources.colCreatedAt')}>
            {formatDateTime(resource.created_at)}
          </InfoItem>
          <InfoItem label={t('admin.resources.colUpdatedAt')}>
            {formatDateTime(resource.updated_at)}
          </InfoItem>
        </SimpleGrid>
      </SectionCard>

      {approvable && canWrite && (
        <SectionCard
          title={t('admin.resources.lifecycleCard')}
          description={t('admin.resources.lifecycleHint')}
        >
          <Stack gap="xs">
            <Group gap="sm">
              {resource.status === 'active' ? (
                <Button
                  color="red"
                  variant="light"
                  disabled={lifecycleBlocked}
                  onClick={() => setActivationModal('deactivate')}
                >
                  {t('admin.resources.requestDeactivate')}
                </Button>
              ) : (
                <Button
                  variant="light"
                  disabled={lifecycleBlocked}
                  onClick={() => setActivationModal('activate')}
                >
                  {t('admin.resources.requestActivate')}
                </Button>
              )}
            </Group>
            {lifecycleBlocked && (
              <Text size="sm" c="dimmed">
                {t('admin.resources.activationPendingHint')}
              </Text>
            )}
          </Stack>
        </SectionCard>
      )}

      {kind !== 'application' && kind !== 'federation' && (
        <SectionCard
          title={t('admin.resources.configCard')}
          description={t(
            resource.status === 'active'
              ? 'admin.resources.configChangeRequest'
              : 'admin.resources.configImmediate',
          )}
        >
          {canWrite ? (
            <Stack gap="sm">
              {configMutation.data?.change_request_id &&
                configMutation.data.change_request_status === 'pending' && (
                  <Alert color="green" variant="light">
                    {t('admin.resources.changeSubmitted')}
                  </Alert>
                )}
              <JsonConfigEditor
                key={data.etag}
                initial={resource.configuration}
                onSave={(reason, configuration) => configMutation.mutate({ reason, configuration })}
                pending={configMutation.isPending}
                error={configMutation.error}
              />
            </Stack>
          ) : (
            <Code block>{JSON.stringify(resource.configuration, null, 2)}</Code>
          )}
        </SectionCard>
      )}

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
        <>
          <FederationConnectionCard
            key={`connection-${data.etag}`}
            {...sectionProps}
            canWrite={canWrite}
          />
          <FederationCredentialsCard
            key={`credentials-${data.etag}`}
            {...sectionProps}
            canWrite={canWrite}
          />
          <FederationScopesCard key={`scopes-${data.etag}`} {...sectionProps} canWrite={canWrite} />
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
            canRequestActivation={approvable && canWrite}
            onRequestActivation={() => setActivationModal('activate')}
            activationPending={activationMutation.isPending}
            activationBlocked={pendingChangeActions.has('activate')}
          />
          <UpstreamSpGuideCard
            spEntityId={resource.sp_entity_id}
            spAcsUrl={resource.sp_acs_url}
            spMetadataUrl={resource.sp_metadata_url}
            spCertificatePem={resource.sp_certificate_pem}
            spCertificateFingerprint={resource.sp_certificate_fingerprint}
          />
        </>
      )}

      {kind === 'application' && (
        <>
          <ApplicationTypeCard {...sectionProps} canWrite={canWrite} />
          <SectionCard
            title={t('admin.applicationProtocols.clientsCard')}
            description={t('admin.applicationProtocols.clientsHint')}
          >
            <ApplicationProtocolCard
              kind="oauth"
              applicationId={resource.id}
              applicationType={rootType}
            />
          </SectionCard>
          <SectionCard
            title={t('admin.applicationProtocols.samlCard')}
            description={t('admin.applicationProtocols.samlHint')}
          >
            <ApplicationProtocolCard
              kind="saml"
              applicationId={resource.id}
              applicationType={rootType}
            />
          </SectionCard>
        </>
      )}

      {kind === 'federation' && canWrite && (
        <SectionCard title={t('admin.federation.advancedCard')}>
          <Stack gap="sm">
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen
                ? t('admin.federation.advancedHide')
                : t('admin.federation.advancedShow')}
            </Button>
            <Collapse expanded={advancedOpen} transitionDuration={200}>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  {t('admin.federation.advancedHint')}
                </Text>
                {configMutation.data?.change_request_id &&
                  configMutation.data.change_request_status === 'pending' && (
                    <Alert color="green" variant="light">
                      {t('admin.resources.changeSubmitted')}
                    </Alert>
                  )}
                <JsonConfigEditor
                  key={data.etag}
                  initial={resource.configuration}
                  onSave={(reason, configuration) =>
                    configMutation.mutate({ reason, configuration })
                  }
                  pending={configMutation.isPending}
                  error={configMutation.error}
                />
              </Stack>
            </Collapse>
          </Stack>
        </SectionCard>
      )}

      {kind === 'oauth' && (
        <OauthClientSections {...sectionProps} canWrite={canWrite} device={isDevice} />
      )}
      {kind === 'saml' && <SamlProviderSections {...sectionProps} canWrite={canWrite} />}
      {(kind === 'saml' || kind === 'federation') && canWrite && (
        <MetadataImportCard kind={kind} {...sectionProps} canWrite={canWrite} />
      )}

      {resource.published_configuration && (
        <SectionCard
          title={t('admin.resources.publishedCard')}
          description={t('admin.resources.publishedHint')}
        >
          <Code block>{JSON.stringify(resource.published_configuration, null, 2)}</Code>
        </SectionCard>
      )}

      {resource.change_requests && resource.change_requests.length > 0 && (
        <ChangeRequestsCard
          requests={resource.change_requests}
          canDecide={canApprove}
          decisionPending={decisionMutation.isPending}
          decisionError={decisionMutation.error}
          onDecide={(request, decision) => setPendingDecision({ request, decision })}
        />
      )}

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
    </Stack>
  );
}
