import {
  Alert,
  Anchor,
  Button,
  Fieldset,
  FileInput,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import {
  createAdminResource,
  listAdminResources,
  uploadApplicationLogo,
} from '@/api/endpoints/admin/resources';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { adminKeys } from '../../keys';
import { useAdminSession } from '../../session/useAdminSession';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { applicationType } from './applicationPresets';
import {
  protocolConfiguration,
  validUris,
  type ApplicationPreset,
  type ProtocolDraft,
} from './applicationPresets';

type Kind = 'application' | 'oauth' | 'saml';

const TITLE_KEYS: Record<Kind, string> = {
  application: 'admin.resources.newApplication',
  oauth: 'admin.applicationProtocols.addClient',
  saml: 'admin.applicationProtocols.addSaml',
};

interface Props {
  kind: Kind;
  opened: boolean;
  onClose: () => void;
  fixedApplicationId?: string;
  applicationType?: ApplicationPreset;
}

export function ApplicationCreateModal({ opened, ...props }: Props) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!pending) props.onClose();
      }}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
      title={t(TITLE_KEYS[props.kind])}
      size="lg"
      withinPortal
    >
      {opened && <ApplicationCreateForm {...props} onPending={setPending} />}
    </Modal>
  );
}

function ApplicationCreateForm({
  kind,
  fixedApplicationId,
  applicationType: fixedType,
  onClose,
  onPending,
}: Omit<Props, 'opened'> & { onPending: (pending: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stepUp = useAdminStepUp();
  const { data: session } = useAdminSession();
  const [selectedPreset, setPreset] = useState<ApplicationPreset>(kind === 'saml' ? 'saml' : 'web');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [developerName, setDeveloperName] = useState('');
  const [developerUrl, setDeveloperUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [risk, setRisk] = useState('normal');
  const [applicationId, setApplicationId] = useState<string | null>(fixedApplicationId ?? null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdApplicationId, setCreatedApplicationId] = useState<string | null>(null);
  const createdApplication = useRef<string | null>(null);
  const [fields, setFields] = useState<ProtocolDraft>({
    redirectUris: '',
    scopes: ['openid', 'profile', 'email'],
    authMethod: 'client_secret_basic',
    subjectType: 'pairwise',
    entityId: '',
    acsUrls: '',
    certificate: '',
    requireSignedRequests: true,
    allowIdpInitiated: false,
  });
  const update = <K extends keyof ProtocolDraft>(key: K, value: ProtocolDraft[K]) =>
    setFields((old) => ({ ...old, [key]: value }));
  const ownerId = owner ?? session?.user_id ?? '';
  const applications = useQuery({
    queryKey: adminKeys.resourceList('application', { limit: 100 }),
    queryFn: ({ signal }) => listAdminResources('application', { limit: 100 }, signal),
    enabled: kind !== 'application' && !fixedApplicationId,
  });
  const parentType =
    fixedType ??
    applicationType(
      applications.data?.items.find((item) => item.id === applicationId)?.configuration[
        'application_type'
      ],
    );
  const presets: ApplicationPreset[] =
    parentType && kind !== 'application'
      ? [parentType]
      : kind === 'application'
        ? ['web', 'spa', 'native', 'device', 'saml']
        : kind === 'oauth'
          ? ['web', 'spa', 'native']
          : ['saml'];
  const preset = presets.includes(selectedPreset) ? selectedPreset : (presets[0] ?? 'web');
  const mutation = useMutation({
    mutationFn: async () => {
      onPending(true);
      try {
        return await stepUp.runWithAdminStepUp(async () => {
          let parentId = createdApplication.current ?? applicationId;
          if (kind === 'application' && !createdApplication.current) {
            const application = await createAdminResource('application', {
              reason: reason.trim(),
              configuration: {
                display_name: displayName.trim(),
                description: description.trim(),
                owner_user_id: ownerId.trim(),
                risk,
                application_type: preset,
                developer_name: developerName.trim(),
                developer_url: developerUrl.trim(),
              },
            });
            parentId = application.id;
            createdApplication.current = application.id;
            setCreatedApplicationId(application.id);
            if (logoFile) {
              await uploadApplicationLogo(application.id, logoFile, logoFile.type);
            }
            await queryClient.invalidateQueries({
              queryKey: adminKeys.resourceKind('application'),
            });
          }
          {
            await createAdminResource(preset === 'saml' ? 'saml' : 'oauth', {
              reason: reason.trim(),
              application_id: parentId ?? undefined,
              configuration: protocolConfiguration(preset, fields, displayName.trim()),
            });
          }
          return parentId;
        });
      } finally {
        onPending(false);
      }
    },
    onSuccess: async (parentId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.resourceKind('application') }),
        queryClient.invalidateQueries({
          queryKey: adminKeys.resourceKind(preset === 'saml' ? 'saml' : 'oauth'),
        }),
      ]);
      onClose();
      if (kind === 'application' && parentId)
        navigate('/admin/applications/' + encodeURIComponent(parentId));
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const invalid = t('admin.applicationCreate.invalid');
    if (!displayName.trim() || [...displayName.trim()].length > 120) next['displayName'] = invalid;
    if ([...reason.trim()].length > 1000) next['reason'] = t('admin.reason.hint');
    if (kind === 'application' && !/^usr_[A-Za-z0-9_-]+$/.test(ownerId.trim()))
      next['owner'] = invalid;
    if (kind === 'application' && developerUrl.trim() !== '') {
      try {
        const parsed = new URL(developerUrl.trim());
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
          next['developerUrl'] = t('admin.branding.invalidUrl');
      } catch {
        next['developerUrl'] = t('admin.branding.invalidUrl');
      }
    }
    if (new TextEncoder().encode(description.trim()).length > 2000) next['description'] = invalid;
    if (kind !== 'application' && !applicationId) next['application'] = invalid;
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
    }
    setErrors(next);
    if (Object.keys(next).length === 0 && !mutation.isPending) mutation.mutate();
  };
  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <Fieldset
          disabled={mutation.isPending || createdApplicationId !== null}
          p={0}
          style={{ border: 0 }}
        >
          <Stack gap="sm">
            <Select
              label={t('admin.applicationCreate.preset')}
              data={presets.map((value) => ({
                value,
                label: t('admin.applicationCreate.presets.' + value),
              }))}
              value={preset}
              onChange={(value) => {
                if (value) {
                  setPreset(value as ApplicationPreset);
                  setErrors({});
                }
              }}
              allowDeselect={false}
              required
            />
            <Text size="sm" c="dimmed">
              {t('admin.applicationCreate.hints.' + preset)}
            </Text>
            {kind !== 'application' && !fixedApplicationId && (
              <>
                <Select
                  label={t('admin.resources.parentApplication')}
                  placeholder={t('admin.resources.parentApplicationPlaceholder')}
                  data={(applications.data?.items ?? []).map((item) => ({
                    value: item.id,
                    label: item.display_name + ' (' + item.id + ')',
                  }))}
                  value={applicationId}
                  onChange={setApplicationId}
                  searchable
                  required
                  error={errors['application']}
                  disabled={applications.isPending}
                />
                <SubmitErrorAlert error={applications.error} />
                {applications.isError && (
                  <Button variant="subtle" onClick={() => applications.refetch()}>
                    {t('common.retry')}
                  </Button>
                )}
              </>
            )}
            {kind === 'oauth' && applicationId && !parentType && (
              <Alert color="blue">
                <Text size="sm">{t('admin.applicationCreate.deviceRequiresType')}</Text>
                <Anchor
                  component={Link}
                  to={'/admin/applications/' + encodeURIComponent(applicationId)}
                  onClick={onClose}
                  size="sm"
                >
                  {t('admin.applicationCreate.classifyApplication')}
                </Anchor>
              </Alert>
            )}
            <TextInput
              label={t('admin.resources.displayName')}
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              required
              data-autofocus
              maxLength={120}
              error={errors['displayName']}
            />
            {kind === 'application' && (
              <>
                <Textarea
                  label={t('admin.applicationCreate.description')}
                  value={description}
                  onChange={(event) => setDescription(event.currentTarget.value)}
                  autosize
                  minRows={2}
                  maxRows={4}
                  error={errors['description']}
                />
                <TextInput
                  label={t('admin.applicationCreate.owner')}
                  description={t('admin.applicationCreate.ownerHint')}
                  value={ownerId}
                  onChange={(event) => setOwner(event.currentTarget.value)}
                  required
                  error={errors['owner']}
                />
                <Select
                  label={t('admin.applicationCreate.risk')}
                  data={[
                    { value: 'normal', label: t('admin.applicationCreate.riskNormal') },
                    { value: 'high', label: t('admin.applicationCreate.riskHigh') },
                  ]}
                  value={risk}
                  onChange={(value) => {
                    if (value) setRisk(value);
                  }}
                  allowDeselect={false}
                />
                <FileInput
                  label={t('admin.branding.logo')}
                  description={t('admin.branding.logoHint')}
                  accept="image/png,image/jpeg"
                  value={logoFile}
                  onChange={setLogoFile}
                  clearable
                />
                <TextInput
                  label={t('admin.branding.developerName')}
                  value={developerName}
                  onChange={(event) => setDeveloperName(event.currentTarget.value)}
                  maxLength={160}
                />
                <TextInput
                  label={t('admin.branding.developerUrl')}
                  value={developerUrl}
                  onChange={(event) => setDeveloperUrl(event.currentTarget.value)}
                  placeholder="https://developer.example.com"
                  maxLength={2048}
                  error={errors['developerUrl']}
                />
              </>
            )}
          </Stack>
        </Fieldset>
        {createdApplicationId && mutation.isError && (
          <Alert color="orange" title={t('admin.applicationCreate.partialTitle')}>
            <Text size="sm">{t('admin.applicationCreate.partialHint')}</Text>
            <Anchor
              component={Link}
              to={'/admin/applications/' + encodeURIComponent(createdApplicationId)}
              onClick={onClose}
              size="sm"
            >
              {t('admin.applicationCreate.viewDraft')}
            </Anchor>
          </Alert>
        )}
        <Fieldset disabled={mutation.isPending} p={0} style={{ border: 0 }}>
          <Stack gap="sm">
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
                <Switch
                  label={t('admin.applicationCreate.signedRequests')}
                  checked={fields.requireSignedRequests}
                  onChange={(event) => update('requireSignedRequests', event.currentTarget.checked)}
                />
                <Switch
                  label={t('admin.applicationCreate.idpInitiated')}
                  checked={fields.allowIdpInitiated}
                  onChange={(event) => update('allowIdpInitiated', event.currentTarget.checked)}
                />
                <Text size="xs" c="dimmed">
                  {t('admin.applicationCreate.nameIdHint')}
                </Text>
              </>
            )}
            <Textarea
              label={t('admin.reason.label')}
              description={t('admin.reason.hint')}
              placeholder={t('admin.reason.placeholder')}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={4}
              required
              error={errors['reason']}
            />
          </Stack>
        </Fieldset>
        <Text size="xs" c="dimmed">
          {t('admin.applicationCreate.draftHint')}
        </Text>
        <SubmitErrorAlert error={mutation.error} hint={t('admin.resources.createHint')} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!displayName.trim() || (kind === 'application' ? !ownerId : !applicationId)}
          >
            {t('admin.resources.create')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
