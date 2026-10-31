import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Code,
  Fieldset,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { AdminSecretResult } from '@/api/endpoints/admin/types';
import {
  addDeveloperOauthRedirectUri,
  addDeveloperSamlAcsUrl,
  addDeveloperSamlSigningCertificate,
  createDeveloperResource,
  importDeveloperSamlMetadata,
  listDeveloperResources,
  patchDeveloperResource,
  putDeveloperSamlAttributePolicy,
  redeemDeveloperOauthClientSecret,
  redeemDeveloperOauthClientSecretRotation,
  removeDeveloperOauthRedirectUri,
  removeDeveloperSamlAcsUrl,
  removeDeveloperSamlSigningCertificate,
  revokeDeveloperOauthClientGrants,
} from '@/api/endpoints/developer/resources';
import { isApiError } from '@/api/errors';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { useStepUp } from '@/features/step-up/useStepUp';
import { AdminStatusBadge } from '@/features/admin/components/AdminStatusBadge';
import { ReasonModal } from '@/features/admin/components/ReasonModal';
import { SecretRevealModal } from '@/features/admin/components/SecretRevealModal';
import {
  MAX_SESSION_DURATION_HOURS,
  sessionDurationDays,
  sessionDurationSeconds,
  validUris,
  protocolConfiguration,
  type ApplicationPreset,
  type ProtocolDraft,
} from '@/features/admin/components/resource/applicationPresets';

import { developerPanelKeys } from '../keys';
import type { DeveloperSectionProps } from './developerTypes';

const DETAIL_PATHS: Record<'oauth' | 'saml', (id: string) => string> = {
  oauth: (id) => `/account/developer/oauth-clients/${encodeURIComponent(id)}/overview`,
  saml: (id) => `/account/developer/saml-service-providers/${encodeURIComponent(id)}/overview`,
};

interface UriEntry {
  id: string;
  uri: string;
}

interface CertificateEntry {
  id: string;
  pem: string;
  fingerprint?: string;
  not_before?: string;
  not_after?: string;
  provenance?: string;
  state?: string;
}

function conflictHint(error: unknown, t: (key: string) => string): string | undefined {
  return isApiError(error) && (error.status === 412 || error.code === 'precondition_failed')
    ? t('admin.config.conflictHint')
    : undefined;
}

export function DeveloperProtocolCard({
  kind,
  applicationId,
  applicationType,
}: {
  kind: 'oauth' | 'saml';
  applicationId: string;
  applicationType?: ApplicationPreset;
}) {
  const { t } = useTranslation();
  const [createOpened, setCreateOpened] = useState(false);

  const query = useQuery({
    queryKey: developerPanelKeys.resourceList(kind, { application_id: applicationId, limit: 100 }),
    queryFn: ({ signal }) =>
      listDeveloperResources(kind, { application_id: applicationId, limit: 100 }, signal),
    enabled: applicationId.length > 0,
    placeholderData: keepPreviousData,
  });

  const canWrite =
    !applicationType || (applicationType === 'saml' ? kind === 'saml' : kind === 'oauth');
  const titleKey =
    kind === 'oauth'
      ? 'admin.applicationProtocols.clientsCard'
      : 'admin.applicationProtocols.samlCard';
  const hintKey =
    kind === 'oauth'
      ? 'admin.applicationProtocols.clientsHint'
      : 'admin.applicationProtocols.samlHint';
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
    <SectionCard
      title={t(titleKey)}
      description={t(hintKey)}
      action={
        canWrite ? (
          <Button size="xs" variant="light" onClick={() => setCreateOpened(true)}>
            {t(addKey)}
          </Button>
        ) : undefined
      }
    >
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
                    <Table.Th />
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
                      <Table.Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Anchor component={Link} to={DETAIL_PATHS[kind](resource.id)} size="sm">
                          {t('admin.resources.openDetail')}
                        </Anchor>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      )}
      <DeveloperProtocolCreateModal
        kind={kind}
        fixedApplicationId={applicationId}
        applicationType={applicationType}
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
      />
    </SectionCard>
  );
}

export function DeveloperProtocolCreateModal({
  kind,
  fixedApplicationId,
  applicationType,
  opened,
  onClose,
}: {
  kind: 'oauth' | 'saml';
  fixedApplicationId?: string;
  applicationType?: ApplicationPreset;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!pending) onClose();
      }}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
      title={t(
        kind === 'oauth'
          ? 'admin.applicationProtocols.addClient'
          : 'admin.applicationProtocols.addSaml',
      )}
      size="lg"
      withinPortal
    >
      {opened && (
        <DeveloperProtocolCreateForm
          kind={kind}
          fixedApplicationId={fixedApplicationId}
          applicationType={applicationType}
          onClose={onClose}
          onPending={setPending}
        />
      )}
    </Modal>
  );
}

function DeveloperProtocolCreateForm({
  kind,
  fixedApplicationId,
  applicationType,
  onClose,
  onPending,
}: {
  kind: 'oauth' | 'saml';
  fixedApplicationId?: string;
  applicationType?: ApplicationPreset;
  onClose: () => void;
  onPending: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const stepUp = useStepUp();
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<ProtocolDraft>({
    redirectUris: '',
    scopes: ['openid', 'profile', 'email'],
    authMethod: 'client_secret_basic',
    subjectType: 'pairwise',
    sessionDurationHours: '',
    entityId: '',
    acsUrls: '',
    certificate: '',
    requireSignedRequests: true,
    allowIdpInitiated: false,
  });
  const update = <K extends keyof ProtocolDraft>(key: K, value: ProtocolDraft[K]) =>
    setFields((old) => ({ ...old, [key]: value }));

  const presets: ApplicationPreset[] =
    applicationType === 'saml'
      ? ['saml']
      : kind === 'saml'
        ? ['saml']
        : applicationType
          ? [applicationType]
          : ['web', 'spa', 'native'];
  const preset = presets[0] ?? 'web';

  const mutation = useMutation({
    mutationFn: async () => {
      onPending(true);
      try {
        return await stepUp.runWithStepUp(
          async () => {
            await createDeveloperResource(preset === 'saml' ? 'saml' : 'oauth', {
              application_id: fixedApplicationId ?? undefined,
              configuration: protocolConfiguration(preset, fields, displayName.trim()),
            });
          },
          { requireVerification: true },
        );
      } finally {
        onPending(false);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: developerPanelKeys.resourceKind(preset === 'saml' ? 'saml' : 'oauth'),
      });
      onClose();
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const invalid = t('admin.applicationCreate.invalid');
    if (!displayName.trim() || [...displayName.trim()].length > 120) next['displayName'] = invalid;
    if (preset === 'saml') {
      if (
        !/^[a-z][a-z0-9+.-]*:[^\s*]+$/i.test(fields.entityId.trim()) ||
        fields.entityId.trim().length > 2048
      )
        next['entityId'] = invalid;
      if (!validUris(fields.acsUrls, true))
        next['acsUrls'] = t('admin.applicationCreate.urisInvalid');
    } else {
      if (preset !== 'device' && !validUris(fields.redirectUris, true))
        next['redirectUris'] = t('admin.applicationCreate.urisInvalid');
      if (
        !fields.scopes.includes('openid') ||
        fields.scopes.length > 32 ||
        fields.scopes.some((scope) => !/^[A-Za-z0-9:._-]{1,80}$/.test(scope))
      )
        next['scopes'] = t('admin.applicationCreate.scopesInvalid');
      const hours = fields.sessionDurationHours;
      if (
        hours !== '' &&
        (!Number.isFinite(hours) ||
          !Number.isInteger(hours) ||
          hours < 1 ||
          hours > MAX_SESSION_DURATION_HOURS)
      )
        next['sessionDuration'] = t('admin.applicationCreate.sessionDurationInvalid');
    }
    setErrors(next);
    if (Object.keys(next).length === 0 && !mutation.isPending) mutation.mutate();
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <Fieldset disabled={mutation.isPending} p={0} style={{ border: 0 }}>
          <Stack gap="sm">
            <TextInput
              label={t('admin.resources.displayName')}
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              required
              data-autofocus
              maxLength={120}
              error={errors['displayName']}
            />
            <Text size="xs" c="dimmed">
              {t('admin.applicationCreate.hints.' + preset)}
            </Text>
            {preset !== 'saml' && (
              <>
                {preset !== 'device' && (
                  <Textarea
                    label={t('admin.applicationCreate.redirectUris')}
                    description={t('admin.applicationCreate.urisHint')}
                    placeholder="https://app.example.com/callback"
                    value={fields.redirectUris}
                    onChange={(event) => update('redirectUris', event.currentTarget.value)}
                    autosize
                    minRows={2}
                    maxRows={5}
                    required
                    error={errors['redirectUris']}
                  />
                )}
                <TagsInput
                  label={t('admin.applicationCreate.scopes')}
                  data={['openid', 'profile', 'email', 'offline_access']}
                  value={fields.scopes}
                  onChange={(value) => update('scopes', value)}
                  error={errors['scopes']}
                  required
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  {preset === 'web' && (
                    <Select
                      label={t('admin.applicationCreate.authMethod')}
                      data={['client_secret_basic', 'client_secret_post']}
                      value={fields.authMethod}
                      onChange={(value) => {
                        if (value) update('authMethod', value as ProtocolDraft['authMethod']);
                      }}
                      allowDeselect={false}
                    />
                  )}
                  <Select
                    label={t('admin.applicationCreate.subject')}
                    data={[
                      { value: 'pairwise', label: t('admin.applicationCreate.pairwise') },
                      { value: 'public', label: t('admin.applicationCreate.public') },
                    ]}
                    value={fields.subjectType}
                    onChange={(value) => {
                      if (value) update('subjectType', value as ProtocolDraft['subjectType']);
                    }}
                    allowDeselect={false}
                  />
                </SimpleGrid>
                <NumberInput
                  label={t('admin.applicationCreate.sessionDuration')}
                  description={t('admin.applicationCreate.sessionDurationHint')}
                  inputWrapperOrder={['label', 'input', 'description', 'error']}
                  placeholder={t('admin.applicationCreate.sessionDurationPlaceholder')}
                  value={fields.sessionDurationHours}
                  onChange={(value) =>
                    update('sessionDurationHours', value === '' ? '' : Number(value))
                  }
                  min={1}
                  max={MAX_SESSION_DURATION_HOURS}
                  allowDecimal={false}
                  clampBehavior="strict"
                  error={errors['sessionDuration']}
                />
              </>
            )}
            {preset === 'saml' && (
              <>
                <TextInput
                  label={t('admin.federation.spEntityId')}
                  value={fields.entityId}
                  onChange={(event) => update('entityId', event.currentTarget.value)}
                  required
                  error={errors['entityId']}
                />
                <Textarea
                  label={t('admin.applicationCreate.acsUrls')}
                  description={t('admin.applicationCreate.urisHint')}
                  placeholder="https://app.example.com/saml/acs"
                  value={fields.acsUrls}
                  onChange={(event) => update('acsUrls', event.currentTarget.value)}
                  autosize
                  minRows={2}
                  maxRows={5}
                  required
                  error={errors['acsUrls']}
                />
                <Textarea
                  label={t('admin.applicationCreate.certificate')}
                  description={t('admin.applicationCreate.certificateHint')}
                  value={fields.certificate}
                  onChange={(event) => update('certificate', event.currentTarget.value)}
                  autosize
                  minRows={3}
                  maxRows={6}
                />
                <Group gap="lg" wrap="wrap">
                  <Switch
                    label={t('admin.applicationCreate.signedRequests')}
                    checked={fields.requireSignedRequests}
                    onChange={(event) =>
                      update('requireSignedRequests', event.currentTarget.checked)
                    }
                  />
                  <Switch
                    label={t('admin.applicationCreate.idpInitiated')}
                    checked={fields.allowIdpInitiated}
                    onChange={(event) => update('allowIdpInitiated', event.currentTarget.checked)}
                  />
                </Group>
              </>
            )}
          </Stack>
        </Fieldset>
        <SubmitErrorAlert error={mutation.error} hint={t('developer.create.hint')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!displayName.trim()}>
            {t('common.submit')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function DeveloperOauthSecretRedeemBanner({
  resource,
  etag,
  refresh,
}: Pick<DeveloperSectionProps, 'resource' | 'etag' | 'refresh'>) {
  const { t } = useTranslation();
  const stepUp = useStepUp();
  const [redeemTarget, setRedeemTarget] = useState<'create_secret' | 'rotate_secret' | null>(null);
  const [overlapSeconds, setOverlapSeconds] = useState<number>(0);
  const [revealedSecret, setRevealedSecret] = useState<AdminSecretResult | null>(null);

  const secretActions = ['create_secret', 'rotate_secret'] as const;

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const rotate = redeemTarget === 'rotate_secret';
      const call = rotate
        ? redeemDeveloperOauthClientSecretRotation
        : redeemDeveloperOauthClientSecret;
      return stepUp.runWithStepUp(
        () =>
          call(
            resource.id,
            {
              overlap_seconds: rotate ? overlapSeconds : undefined,
            },
            etag,
          ),
        { requireVerification: true },
      );
    },
    onSuccess: (data) => {
      setRedeemTarget(null);
      setRevealedSecret(data);
      return refresh();
    },
  });

  if (resource.configuration['client_type'] !== 'confidential') return null;

  return (
    <>
      {
        <Alert color="green" variant="light">
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Text size="sm">{t('admin.oauth.redeemReady')}</Text>
            <Group gap="sm">
              {secretActions.map((action) => (
                <Button
                  key={action}
                  size="xs"
                  onClick={() => {
                    redeemMutation.reset();
                    setRedeemTarget(action);
                    setOverlapSeconds(0);
                  }}
                >
                  {t('admin.oauth.redeem', {
                    action: t(`admin.changeAction.${action}`),
                  })}
                </Button>
              ))}
            </Group>
          </Group>
        </Alert>
      }
      <SubmitInlineError error={redeemMutation.error} />

      <ReasonModal
        opened={redeemTarget !== null}
        onClose={() => (redeemMutation.isPending ? undefined : setRedeemTarget(null))}
        title={t('admin.oauth.redeemTitle')}
        confirmLabel={t('admin.oauth.redeemSubmit')}
        pending={redeemMutation.isPending}
        error={redeemMutation.error}
        errorHint={
          isApiError(redeemMutation.error) && redeemMutation.error.status === 409
            ? t('admin.oauth.redeemConflictHint')
            : isApiError(redeemMutation.error) && redeemMutation.error.status === 403
              ? t('admin.oauth.redeemForbiddenHint')
              : undefined
        }
        extraFields={
          redeemTarget === 'rotate_secret' ? (
            <NumberInput
              label={t('admin.oauth.overlap')}
              description={t('admin.oauth.overlapHint')}
              value={overlapSeconds}
              onChange={(value) => setOverlapSeconds(Number(value) || 0)}
              min={0}
              max={3600}
              data-autofocus
            />
          ) : undefined
        }
        onSubmit={() => redeemMutation.mutate()}
      />

      <SecretRevealModal
        opened={revealedSecret !== null}
        onClose={() => {
          setRevealedSecret(null);
          redeemMutation.reset();
        }}
        secret={revealedSecret}
      />
    </>
  );
}

export function DeveloperOauthSections({
  resource,
  etag,
  refresh,
  device = false,
}: DeveloperSectionProps & { device?: boolean }) {
  const { t } = useTranslation();
  const stepUp = useStepUp();

  const redirectUris = (resource.configuration['redirect_uris'] as UriEntry[] | undefined) ?? [];
  const isConfidential = resource.configuration['client_type'] === 'confidential';
  const sessionSeconds = Number(resource.configuration['refresh_token_ttl_seconds']) || 0;
  const configuredSessionHours = sessionSeconds > 0 ? sessionSeconds / 3600 : '';

  const [newUri, setNewUri] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UriEntry | null>(null);
  const [secretRequest, setSecretRequest] = useState<'create_secret' | 'rotate_secret' | null>(
    null,
  );
  const [grantUserId, setGrantUserId] = useState('');
  const [grantModal, setGrantModal] = useState(false);
  const [sessionHours, setSessionHours] = useState<number | ''>(configuredSessionHours);
  const [sessionError, setSessionError] = useState(false);
  const [sessionModal, setSessionModal] = useState(false);

  const invalidate = refresh;

  const sessionMutation = useMutation({
    mutationFn: () =>
      stepUp.runWithStepUp(
        () =>
          patchDeveloperResource(
            'oauth',
            resource.id,
            {
              configuration: { refresh_token_ttl_seconds: sessionDurationSeconds(sessionHours) },
            },
            etag,
          ),
        { requireVerification: true },
      ),
    onSuccess: async () => {
      setSessionModal(false);
      await invalidate();
    },
  });

  const sessionDirty = sessionHours !== configuredSessionHours;
  const sessionHoursValid =
    sessionHours === '' ||
    (Number.isInteger(sessionHours) &&
      sessionHours >= 1 &&
      sessionHours <= MAX_SESSION_DURATION_HOURS);

  const addMutation = useMutation({
    mutationFn: async () =>
      stepUp.runWithStepUp(
        () => addDeveloperOauthRedirectUri(resource.id, { uri: newUri.trim() }, etag),
        { requireVerification: true },
      ),
    onSuccess: async () => {
      setAddModal(false);
      setNewUri('');
      await invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (input: { entry: UriEntry }) =>
      stepUp.runWithStepUp(
        () => removeDeveloperOauthRedirectUri(resource.id, input.entry.id, etag),
        { requireVerification: true },
      ),
    onSuccess: async () => {
      setRemoveTarget(null);
      await invalidate();
    },
  });

  const grantMutation = useMutation({
    mutationFn: async () =>
      stepUp.runWithStepUp(
        () =>
          revokeDeveloperOauthClientGrants(resource.id, {
            ...(grantUserId.trim() ? { user_id: grantUserId.trim() } : {}),
          }),
        { requireVerification: true },
      ),
    onSuccess: async () => {
      setGrantModal(false);
      setGrantUserId('');
    },
  });

  const [revealedSecret, setRevealedSecret] = useState<AdminSecretResult | null>(null);
  const [overlapSeconds, setOverlapSeconds] = useState(0);
  const secretRequestMutation = useMutation({
    mutationFn: () =>
      stepUp.runWithStepUp(
        () =>
          (secretRequest === 'rotate_secret'
            ? redeemDeveloperOauthClientSecretRotation
            : redeemDeveloperOauthClientSecret)(
            resource.id,
            { overlap_seconds: secretRequest === 'rotate_secret' ? overlapSeconds : undefined },
            etag,
          ),
        { requireVerification: true },
      ),
    onSuccess: async (result) => {
      setSecretRequest(null);
      setRevealedSecret(result);
      await invalidate();
    },
  });

  return (
    <>
      {!device && (
        <SectionCard
          title={t('admin.oauth.redirectCard')}
          description={t('admin.oauth.redirectHint')}
          action={
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                addMutation.reset();
                setNewUri('');
                setAddModal(true);
              }}
            >
              {t('admin.oauth.addRedirect')}
            </Button>
          }
        >
          <Stack gap="xs">
            {redirectUris.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('admin.oauth.noRedirects')}
              </Text>
            )}
            {redirectUris.map((entry) => (
              <Group key={entry.id} justify="space-between" gap="sm" wrap="nowrap">
                <Code style={{ wordBreak: 'break-all' }}>{entry.uri}</Code>
                <ActionIcon
                  color="red"
                  variant="light"
                  size="sm"
                  aria-label={t('admin.oauth.removeRedirect')}
                  onClick={() => {
                    removeMutation.reset();
                    setRemoveTarget(entry);
                  }}
                >
                  ×
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </SectionCard>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <SectionCard
          title={t('admin.oauth.sessionCard')}
          description={t('admin.oauth.sessionHint')}
          action={
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                sessionMutation.reset();
                setSessionHours(configuredSessionHours);
                setSessionError(false);
                setSessionModal(true);
              }}
            >
              {t('admin.oauth.sessionSave')}
            </Button>
          }
        >
          <InfoItem label={t('admin.oauth.sessionField')}>
            <Text size="sm">
              {sessionSeconds > 0
                ? t('admin.oauth.sessionCurrent', {
                    hours: sessionSeconds / 3600,
                    days: sessionDurationDays(sessionSeconds),
                  })
                : t('admin.oauth.sessionDefault')}
            </Text>
          </InfoItem>
        </SectionCard>

        <SectionCard
          title={t('admin.oauth.grantsCard')}
          description={t('admin.oauth.grantsHint')}
          action={
            <Button
              size="xs"
              color="red"
              variant="light"
              onClick={() => {
                grantMutation.reset();
                setGrantUserId('');
                setGrantModal(true);
              }}
            >
              {t('admin.oauth.revokeGrants')}
            </Button>
          }
        >
          <Text size="sm" c="dimmed">
            {t('admin.oauth.grantsNote')}
          </Text>
        </SectionCard>
      </SimpleGrid>

      {isConfidential && (
        <SectionCard
          title={t('admin.oauth.secretCard')}
          description={t('admin.oauth.secretHint')}
          action={
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  secretRequestMutation.reset();
                  setSecretRequest('create_secret');
                }}
              >
                {t('admin.oauth.requestSecret')}
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  secretRequestMutation.reset();
                  setSecretRequest('rotate_secret');
                }}
              >
                {t('admin.oauth.requestRotation')}
              </Button>
            </Group>
          }
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {t('admin.oauth.secretFlow')}
            </Text>
            <SubmitInlineError error={secretRequestMutation.error} />
          </Stack>
        </SectionCard>
      )}

      <ReasonModal
        opened={addModal}
        onClose={() => (addMutation.isPending ? undefined : setAddModal(false))}
        title={t('admin.oauth.addRedirect')}
        confirmLabel={t('admin.oauth.addRedirect')}
        confirmDisabled={newUri.trim().length === 0}
        pending={addMutation.isPending}
        error={addMutation.error}
        errorHint={conflictHint(addMutation.error, t)}
        extraFields={
          <TextInput
            label={t('admin.oauth.redirectCard')}
            value={newUri}
            onChange={(event) => setNewUri(event.currentTarget.value)}
            placeholder="https://client.example/callback"
            data-autofocus
            required
          />
        }
        onSubmit={() => addMutation.mutate()}
      />

      <ReasonModal
        opened={removeTarget !== null}
        onClose={() => (removeMutation.isPending ? undefined : setRemoveTarget(null))}
        title={t('admin.oauth.removeRedirect')}
        description={removeTarget?.uri}
        confirmLabel={t('common.delete')}
        confirmColor="red"
        pending={removeMutation.isPending}
        error={removeMutation.error}
        errorHint={conflictHint(removeMutation.error, t)}
        onSubmit={() => {
          if (removeTarget) {
            removeMutation.mutate({ entry: removeTarget });
          }
        }}
      />

      <ReasonModal
        opened={sessionModal}
        onClose={() => (sessionMutation.isPending ? undefined : setSessionModal(false))}
        title={t('admin.oauth.sessionSave')}
        confirmLabel={t('common.submit')}
        confirmDisabled={!sessionDirty || !sessionHoursValid}
        pending={sessionMutation.isPending}
        error={sessionMutation.error}
        errorHint={conflictHint(sessionMutation.error, t)}
        extraFields={
          <NumberInput
            label={t('admin.oauth.sessionField')}
            description={t('admin.oauth.sessionFieldHint')}
            placeholder={t('admin.oauth.sessionDefault')}
            value={sessionHours}
            onChange={(value) => {
              const next = value === '' ? '' : Number(value);
              setSessionHours(next);
              setSessionError(
                !(
                  next === '' ||
                  (Number.isInteger(next) && next >= 1 && next <= MAX_SESSION_DURATION_HOURS)
                ),
              );
            }}
            min={1}
            max={MAX_SESSION_DURATION_HOURS}
            allowDecimal={false}
            clampBehavior="strict"
            error={sessionError ? t('admin.oauth.sessionInvalid') : undefined}
            data-autofocus
          />
        }
        onSubmit={() => {
          if (!sessionHoursValid) {
            setSessionError(true);
            return;
          }
          sessionMutation.mutate();
        }}
      />

      <ReasonModal
        opened={grantModal}
        onClose={() => (grantMutation.isPending ? undefined : setGrantModal(false))}
        title={t('admin.oauth.revokeGrants')}
        description={t('admin.oauth.grantsConfirm')}
        confirmLabel={t('admin.oauth.revokeGrants')}
        confirmColor="red"
        pending={grantMutation.isPending}
        error={grantMutation.error}
        extraFields={
          <TextInput
            label={t('admin.oauth.grantUserPlaceholder')}
            description={t('admin.oauth.grantsNote')}
            value={grantUserId}
            onChange={(event) => setGrantUserId(event.currentTarget.value)}
            placeholder="usr_…"
            data-autofocus
          />
        }
        onSubmit={() => grantMutation.mutate()}
      />

      <ReasonModal
        opened={secretRequest !== null}
        onClose={() => (secretRequestMutation.isPending ? undefined : setSecretRequest(null))}
        title={
          secretRequest === 'rotate_secret'
            ? t('admin.oauth.requestRotation')
            : t('admin.oauth.requestSecret')
        }
        description={t('admin.oauth.secretRequestConfirm', { name: resource.display_name })}
        confirmLabel={t('common.submit')}
        pending={secretRequestMutation.isPending}
        error={secretRequestMutation.error}
        extraFields={
          secretRequest === 'rotate_secret' ? (
            <NumberInput
              label={t('admin.oauth.overlap')}
              value={overlapSeconds}
              onChange={(value) => setOverlapSeconds(Number(value) || 0)}
              min={0}
              max={3600}
            />
          ) : undefined
        }
        onSubmit={() => secretRequestMutation.mutate()}
      />
      <SecretRevealModal
        opened={revealedSecret !== null}
        onClose={() => setRevealedSecret(null)}
        secret={revealedSecret}
      />
    </>
  );
}

export function DeveloperSamlSections({ resource, etag, refresh }: DeveloperSectionProps) {
  const { t } = useTranslation();
  const stepUp = useStepUp();

  const acsUrls = (resource.configuration['acs_urls'] as UriEntry[] | undefined) ?? [];
  const certificates =
    (resource.configuration['signing_certificates'] as CertificateEntry[] | undefined) ?? [];
  const policy =
    (resource.configuration['attribute_policy'] as Record<string, string> | undefined) ?? {};

  const [newAcs, setNewAcs] = useState('');
  const [addAcsModal, setAddAcsModal] = useState(false);
  const [removeAcs, setRemoveAcs] = useState<UriEntry | null>(null);
  const [pemDraft, setPemDraft] = useState('');
  const [addCertModal, setAddCertModal] = useState(false);
  const [removeCert, setRemoveCert] = useState<CertificateEntry | null>(null);
  const [policyDraft, setPolicyDraft] = useState('');
  const [policyModal, setPolicyModal] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const wrap = <T,>(action: () => Promise<T>) =>
    stepUp.runWithStepUp(action, { requireVerification: true });

  const addAcsMutation = useMutation({
    mutationFn: () => wrap(() => addDeveloperSamlAcsUrl(resource.id, { uri: newAcs.trim() }, etag)),
    onSuccess: async () => {
      setAddAcsModal(false);
      setNewAcs('');
      await refresh();
    },
  });

  const removeAcsMutation = useMutation({
    mutationFn: (input: { entry: UriEntry }) =>
      wrap(() => removeDeveloperSamlAcsUrl(resource.id, input.entry.id, etag)),
    onSuccess: async () => {
      setRemoveAcs(null);
      await refresh();
    },
  });

  const addCertMutation = useMutation({
    mutationFn: () =>
      wrap(() => addDeveloperSamlSigningCertificate(resource.id, { pem: pemDraft.trim() }, etag)),
    onSuccess: async () => {
      setAddCertModal(false);
      setPemDraft('');
      await refresh();
    },
  });

  const removeCertMutation = useMutation({
    mutationFn: (input: { entry: CertificateEntry }) =>
      wrap(() => removeDeveloperSamlSigningCertificate(resource.id, input.entry.id, etag)),
    onSuccess: async () => {
      setRemoveCert(null);
      await refresh();
    },
  });

  const policyMutation = useMutation({
    mutationFn: (input: { attribute_policy: Record<string, string> }) =>
      wrap(() => putDeveloperSamlAttributePolicy(resource.id, input, etag)),
    onSuccess: async () => {
      setPolicyModal(false);
      setPolicyError(null);
      await refresh();
    },
  });

  const openPolicyModal = () => {
    setPolicyDraft(`${JSON.stringify(policy, null, 2)}\n`);
    setPolicyError(null);
    policyMutation.reset();
    setPolicyModal(true);
  };

  const submitPolicy = () => {
    try {
      const parsed: unknown = JSON.parse(policyDraft);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((value) => typeof value !== 'string')
      ) {
        setPolicyError(t('admin.saml.policyInvalid'));
        return;
      }
      setPolicyError(null);
      policyMutation.mutate({ attribute_policy: parsed as Record<string, string> });
    } catch {
      setPolicyError(t('admin.config.invalidJson'));
    }
  };

  return (
    <>
      <SectionCard
        title={t('admin.saml.acsCard')}
        description={t('admin.saml.acsHint')}
        action={
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              addAcsMutation.reset();
              setNewAcs('');
              setAddAcsModal(true);
            }}
          >
            {t('admin.saml.addAcs')}
          </Button>
        }
      >
        <Stack gap="xs">
          {acsUrls.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('admin.saml.noAcs')}
            </Text>
          )}
          {acsUrls.map((entry) => (
            <Group key={entry.id} justify="space-between" gap="sm" wrap="nowrap">
              <Code style={{ wordBreak: 'break-all' }}>{entry.uri}</Code>
              <ActionIcon
                color="red"
                variant="light"
                size="sm"
                aria-label={t('admin.saml.removeAcs')}
                onClick={() => {
                  removeAcsMutation.reset();
                  setRemoveAcs(entry);
                }}
              >
                ×
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </SectionCard>

      <SectionCard
        title={t('admin.saml.certCard')}
        description={t('admin.saml.certHint')}
        action={
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              addCertMutation.reset();
              setPemDraft('');
              setAddCertModal(true);
            }}
          >
            {t('admin.saml.addCert')}
          </Button>
        }
      >
        <Stack gap="xs">
          {certificates.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('admin.saml.noCerts')}
            </Text>
          )}
          {certificates.map((entry) => (
            <Group key={entry.id} justify="space-between" gap="sm" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  {entry.state && (
                    <AdminStatusBadge
                      status={entry.state === 'retired' ? 'disabled' : entry.state}
                    />
                  )}
                  <Text size="xs" ff="monospace" lineClamp={1}>
                    {entry.fingerprint ?? entry.id}
                  </Text>
                </Group>
                {(entry.not_before || entry.not_after) && (
                  <Text size="xs" c="dimmed">
                    {formatDateTime(entry.not_before ?? null)} →{' '}
                    {formatDateTime(entry.not_after ?? null)}
                  </Text>
                )}
              </Stack>
              {entry.state !== 'retired' && (
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => {
                    removeCertMutation.reset();
                    setRemoveCert(entry);
                  }}
                >
                  {t('admin.saml.retireCert')}
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      </SectionCard>

      <SectionCard
        title={t('admin.saml.policyCard')}
        description={t('admin.saml.policyHint')}
        action={
          <Button size="xs" variant="light" onClick={openPolicyModal}>
            {t('admin.saml.editPolicy')}
          </Button>
        }
      >
        <Stack gap="xs">
          {Object.keys(policy).length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('admin.saml.noPolicy')}
            </Text>
          ) : (
            Object.entries(policy).map(([source, target]) => (
              <Text key={source} size="sm" ff="monospace">
                {source} → {target}
              </Text>
            ))
          )}
        </Stack>
      </SectionCard>

      <ReasonModal
        opened={addAcsModal}
        onClose={() => (addAcsMutation.isPending ? undefined : setAddAcsModal(false))}
        title={t('admin.saml.addAcs')}
        confirmLabel={t('admin.saml.addAcs')}
        confirmDisabled={newAcs.trim().length === 0}
        pending={addAcsMutation.isPending}
        error={addAcsMutation.error}
        errorHint={conflictHint(addAcsMutation.error, t)}
        extraFields={
          <TextInput
            label={t('admin.saml.acsCard')}
            value={newAcs}
            onChange={(event) => setNewAcs(event.currentTarget.value)}
            placeholder="https://sp.example/acs"
            data-autofocus
            required
          />
        }
        onSubmit={() => addAcsMutation.mutate()}
      />

      <ReasonModal
        opened={removeAcs !== null}
        onClose={() => (removeAcsMutation.isPending ? undefined : setRemoveAcs(null))}
        title={t('admin.saml.removeAcs')}
        description={removeAcs?.uri}
        confirmLabel={t('common.delete')}
        confirmColor="red"
        pending={removeAcsMutation.isPending}
        error={removeAcsMutation.error}
        errorHint={conflictHint(removeAcsMutation.error, t)}
        onSubmit={() => {
          if (removeAcs) {
            removeAcsMutation.mutate({ entry: removeAcs });
          }
        }}
      />

      <ReasonModal
        opened={addCertModal}
        onClose={() => (addCertMutation.isPending ? undefined : setAddCertModal(false))}
        title={t('admin.saml.addCert')}
        confirmDisabled={pemDraft.trim().length === 0}
        extraFields={
          <Textarea
            label={t('admin.federation.certificateInput')}
            value={pemDraft}
            onChange={(event) => setPemDraft(event.currentTarget.value)}
            placeholder="-----BEGIN CERTIFICATE-----"
            autosize
            minRows={4}
            maxRows={10}
            ff="monospace"
            data-autofocus
          />
        }
        confirmLabel={t('admin.saml.addCert')}
        pending={addCertMutation.isPending}
        error={addCertMutation.error}
        errorHint={conflictHint(addCertMutation.error, t)}
        onSubmit={() => addCertMutation.mutate()}
      />

      <ReasonModal
        opened={removeCert !== null}
        onClose={() => (removeCertMutation.isPending ? undefined : setRemoveCert(null))}
        title={t('admin.saml.retireCert')}
        description={removeCert?.fingerprint ?? removeCert?.id}
        confirmLabel={t('admin.saml.retireCert')}
        confirmColor="red"
        pending={removeCertMutation.isPending}
        error={removeCertMutation.error}
        errorHint={conflictHint(removeCertMutation.error, t)}
        onSubmit={() => {
          if (removeCert) {
            removeCertMutation.mutate({ entry: removeCert });
          }
        }}
      />

      <ReasonModal
        opened={policyModal}
        onClose={() => (policyMutation.isPending ? undefined : setPolicyModal(false))}
        title={t('admin.saml.editPolicy')}
        extraFields={
          <Textarea
            label={t('admin.saml.policyLabel')}
            value={policyDraft}
            onChange={(event) => setPolicyDraft(event.currentTarget.value)}
            error={policyError ?? undefined}
            autosize
            minRows={4}
            maxRows={12}
            ff="monospace"
            data-autofocus
          />
        }
        confirmLabel={t('common.save')}
        pending={policyMutation.isPending}
        error={policyMutation.error}
        errorHint={conflictHint(policyMutation.error, t)}
        onSubmit={submitPolicy}
      />
    </>
  );
}

export function DeveloperMetadataImportCard({
  resource,
  etag,
  refresh,
  canWrite = true,
}: DeveloperSectionProps) {
  const { t } = useTranslation();
  const stepUp = useStepUp();
  const [metadata, setMetadata] = useState('');
  const [modal, setModal] = useState(false);

  // Paste-format import only: the developer endpoint does not fetch remote
  // discovery URLs, so no discovery input is offered here.
  const mutation = useMutation({
    mutationFn: () =>
      stepUp.runWithStepUp(
        () =>
          importDeveloperSamlMetadata(
            resource.id,
            {
              metadata,
              format: 'saml',
            },
            etag,
          ),
        { requireVerification: true },
      ),
    onSuccess: async () => {
      setModal(false);
      setMetadata('');
      await refresh();
    },
  });

  const closeModal = () => {
    setModal(false);
    mutation.reset();
  };

  return (
    <>
      <SectionCard
        title={t('admin.metadata.title')}
        description={t('admin.metadata.hint', { format: 'SAML XML' })}
        action={
          canWrite ? (
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                mutation.reset();
                setModal(true);
              }}
            >
              {t('admin.metadata.submit')}
            </Button>
          ) : undefined
        }
      >
        <Stack gap="xs">
          {mutation.isSuccess && (
            <Alert color="green" variant="light">
              {t('admin.metadata.imported')}
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            {t('admin.metadata.trustReview')}
          </Text>
        </Stack>
      </SectionCard>

      <ReasonModal
        opened={modal}
        onClose={() => (mutation.isPending ? undefined : closeModal())}
        title={t('admin.metadata.submit')}
        description={t('admin.metadata.confirm')}
        confirmLabel={t('admin.metadata.submit')}
        confirmDisabled={metadata.trim().length === 0}
        pending={mutation.isPending}
        error={mutation.error}
        size="lg"
        extraFields={
          <Textarea
            label={t('admin.metadata.title')}
            value={metadata}
            onChange={(event) => setMetadata(event.currentTarget.value)}
            placeholder="<EntityDescriptor …>"
            autosize
            minRows={6}
            maxRows={14}
            ff="monospace"
            data-autofocus
            required
          />
        }
        onSubmit={() => mutation.mutate()}
      />
    </>
  );
}

function SubmitInlineError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) {
    return null;
  }
  return (
    <Alert color="red" variant="light" role="alert" title={t('errors.title')}>
      <Text size="sm">{describeApiError(error)}</Text>
    </Alert>
  );
}
