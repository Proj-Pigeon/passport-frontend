import {
  Badge,
  Button,
  Group,
  MantineThemeProvider,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminResourceInput } from '@/api/endpoints/admin/types';
import { patchDeveloperResource } from '@/api/endpoints/developer/resources';
import { isApiError } from '@/api/errors';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { ReasonModal } from '@/features/admin/components/ReasonModal';
import { useStepUp } from '@/features/step-up/useStepUp';

import type { DeveloperSectionProps } from './developerTypes';

type ProtocolKind = 'oauth' | 'saml';

interface ProtocolSettings {
  allowed_scopes: string[];
  token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none';
  subject_type: 'pairwise' | 'public';
  entity_id: string;
  require_signed_requests: boolean;
  allow_idp_initiated: boolean;
}

interface EditorState {
  initial: ProtocolSettings;
  values: ProtocolSettings;
  etag: string;
}

function readSettings(configuration: Record<string, unknown>): ProtocolSettings {
  return {
    allowed_scopes: Array.isArray(configuration['allowed_scopes'])
      ? configuration['allowed_scopes'].filter(
          (scope): scope is string => typeof scope === 'string',
        )
      : ['openid'],
    token_endpoint_auth_method:
      configuration['client_type'] === 'confidential'
        ? configuration['token_endpoint_auth_method'] === 'client_secret_post'
          ? 'client_secret_post'
          : 'client_secret_basic'
        : 'none',
    subject_type: configuration['subject_type'] === 'public' ? 'public' : 'pairwise',
    entity_id: typeof configuration['entity_id'] === 'string' ? configuration['entity_id'] : '',
    require_signed_requests: configuration['require_signed_requests'] !== false,
    allow_idp_initiated: configuration['allow_idp_initiated'] === true,
  };
}

export function DeveloperProtocolSettingsCard({
  kind,
  resource,
  etag,
  refresh,
  canWrite = true,
}: DeveloperSectionProps & { kind: ProtocolKind }) {
  const { t } = useTranslation();
  const stepUp = useStepUp();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProtocolSettings, string>>>({});
  const current = readSettings(resource.configuration);
  const values = editor?.values ?? current;
  const isConfidential = resource.configuration['client_type'] === 'confidential';

  const mutation = useMutation({
    mutationFn: ({ input, editEtag }: { input: AdminResourceInput; editEtag: string }) =>
      stepUp.runWithStepUp(() => patchDeveloperResource(kind, resource.id, input, editEtag), {
        requireVerification: true,
      }),
    onSuccess: async (result) => {
      setEditor(null);
      if (result.change_request_id) {
        notifications.show({
          color: 'teal',
          message: t('admin.resources.changeAutoApproved'),
        });
      }
      await refresh();
    },
  });

  const fields: (keyof ProtocolSettings)[] =
    kind === 'oauth'
      ? [
          'allowed_scopes',
          'subject_type',
          ...(isConfidential ? (['token_endpoint_auth_method'] as const) : []),
        ]
      : ['entity_id', 'require_signed_requests', 'allow_idp_initiated'];
  const configuration: AdminResourceInput['configuration'] = {};
  if (editor) {
    for (const field of fields) {
      if (JSON.stringify(editor.initial[field]) !== JSON.stringify(values[field])) {
        configuration[field] = values[field];
      }
    }
  }
  const dirty = Object.keys(configuration).length > 0;
  const disabled = mutation.isPending || !canWrite;

  const update = <K extends keyof ProtocolSettings>(field: K, value: ProtocolSettings[K]) => {
    setEditor((previous) =>
      previous ? { ...previous, values: { ...previous.values, [field]: value } } : previous,
    );
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = () => {
    if (!editor || disabled) return;
    const next: typeof errors = {};
    if (kind === 'oauth') {
      if (
        values.allowed_scopes.length < 1 ||
        values.allowed_scopes.length > 32 ||
        !values.allowed_scopes.includes('openid') ||
        values.allowed_scopes.some(
          (scope) => scope.length < 1 || scope.length > 80 || /[^A-Za-z0-9:._-]/.test(scope),
        )
      ) {
        next.allowed_scopes = t('admin.applicationCreate.scopesInvalid');
      }
    } else if (
      values.entity_id.length > 2048 ||
      /[\s*]/.test(values.entity_id) ||
      !/^[a-z][a-z0-9+.-]*:.+$/i.test(values.entity_id)
    ) {
      next.entity_id = t('admin.applicationCreate.invalid');
    }
    setErrors(next);
    if (Object.keys(next).length === 0 && dirty) {
      mutation.mutate({ input: { configuration }, editEtag: editor.etag });
    }
  };

  return (
    <>
      <SectionCard
        title={t('developer.protocolSettings.card')}
        description={t('developer.protocolSettings.hint')}
        action={
          canWrite ? (
            <Button
              size="xs"
              variant="light"
              style={{ flexShrink: 0 }}
              disabled={mutation.isPending}
              onClick={() => {
                mutation.reset();
                setErrors({});
                setEditor({ initial: current, values: current, etag });
              }}
            >
              {t('developer.protocolSettings.edit')}
            </Button>
          ) : undefined
        }
      >
        <Stack gap="md">
          {kind === 'oauth' ? (
            <>
              <InfoItem label={t('admin.applicationCreate.scopes')}>
                <Group gap="xs">
                  {current.allowed_scopes.map((scope) => (
                    <Badge key={scope} size="md" variant="light" tt="none">
                      {scope}
                    </Badge>
                  ))}
                  {current.allowed_scopes.length === 0 && <Text size="md">—</Text>}
                </Group>
              </InfoItem>
              <InfoItem label={t('admin.applicationCreate.authMethod')}>
                <Text size="md">{current.token_endpoint_auth_method}</Text>
              </InfoItem>
              <InfoItem label={t('admin.applicationCreate.subject')}>
                <Text size="md">
                  {t(
                    current.subject_type === 'pairwise'
                      ? 'admin.applicationCreate.pairwise'
                      : 'admin.applicationCreate.public',
                  )}
                </Text>
              </InfoItem>
            </>
          ) : (
            <>
              <InfoItem label={t('admin.federation.spEntityId')}>
                <Text size="md" style={{ overflowWrap: 'anywhere' }}>
                  {current.entity_id || '—'}
                </Text>
              </InfoItem>
              <InfoItem label={t('admin.applicationCreate.signedRequests')}>
                <Text size="md">
                  {t(current.require_signed_requests ? 'common.yes' : 'common.no')}
                </Text>
              </InfoItem>
              <InfoItem label={t('admin.applicationCreate.idpInitiated')}>
                <Text size="md">{t(current.allow_idp_initiated ? 'common.yes' : 'common.no')}</Text>
              </InfoItem>
            </>
          )}
        </Stack>
      </SectionCard>
      <MantineThemeProvider
        theme={{
          components: {
            Button: Button.extend({ defaultProps: { size: 'md' } }),
            Textarea: Textarea.extend({
              defaultProps: {
                size: 'md',
                disabled,
                inputWrapperOrder: ['label', 'input', 'description', 'error'],
              },
            }),
          },
        }}
      >
        <ReasonModal
          opened={editor !== null}
          onClose={() => {
            if (!mutation.isPending) setEditor(null);
          }}
          size="md"
          title={t('developer.protocolSettings.edit')}
          confirmLabel={t('common.submit')}
          confirmDisabled={!dirty || disabled}
          pending={mutation.isPending}
          error={mutation.error}
          errorHint={
            isApiError(mutation.error) &&
            (mutation.error.status === 412 || mutation.error.code === 'precondition_failed')
              ? t('admin.config.conflictHint')
              : undefined
          }
          extraFields={
            <Stack gap="md">
              {kind === 'oauth' ? (
                <>
                  <TagsInput
                    size="md"
                    label={t('admin.applicationCreate.scopes')}
                    data={['openid', 'profile', 'email', 'offline_access']}
                    value={values.allowed_scopes}
                    onChange={(value) => update('allowed_scopes', value)}
                    error={errors.allowed_scopes}
                    disabled={disabled}
                    required
                    data-autofocus
                  />
                  {isConfidential ? (
                    <Select
                      size="md"
                      label={t('admin.applicationCreate.authMethod')}
                      data={['client_secret_basic', 'client_secret_post']}
                      value={values.token_endpoint_auth_method}
                      onChange={(value) => {
                        if (value === 'client_secret_basic' || value === 'client_secret_post') {
                          update('token_endpoint_auth_method', value);
                        }
                      }}
                      allowDeselect={false}
                      disabled={disabled}
                    />
                  ) : (
                    <TextInput
                      size="md"
                      label={t('admin.applicationCreate.authMethod')}
                      value="none"
                      readOnly
                      disabled={disabled}
                    />
                  )}
                  <Select
                    size="md"
                    label={t('admin.applicationCreate.subject')}
                    data={[
                      { value: 'pairwise', label: t('admin.applicationCreate.pairwise') },
                      { value: 'public', label: t('admin.applicationCreate.public') },
                    ]}
                    value={values.subject_type}
                    onChange={(value) => {
                      if (value === 'pairwise' || value === 'public') update('subject_type', value);
                    }}
                    allowDeselect={false}
                    disabled={disabled}
                  />
                </>
              ) : (
                <>
                  <TextInput
                    size="md"
                    label={t('admin.federation.spEntityId')}
                    value={values.entity_id}
                    onChange={(event) => update('entity_id', event.currentTarget.value)}
                    maxLength={2048}
                    error={errors.entity_id}
                    disabled={disabled}
                    required
                    data-autofocus
                  />
                  <Switch
                    size="md"
                    label={t('admin.applicationCreate.signedRequests')}
                    checked={values.require_signed_requests}
                    onChange={(event) =>
                      update('require_signed_requests', event.currentTarget.checked)
                    }
                    disabled={disabled}
                  />
                  <Switch
                    size="md"
                    label={t('admin.applicationCreate.idpInitiated')}
                    checked={values.allow_idp_initiated}
                    onChange={(event) => update('allow_idp_initiated', event.currentTarget.checked)}
                    disabled={disabled}
                  />
                </>
              )}
            </Stack>
          }
          onSubmit={submit}
        />
      </MantineThemeProvider>
    </>
  );
}
