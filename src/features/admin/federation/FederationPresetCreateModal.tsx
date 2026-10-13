import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  PasswordInput,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IconBrandGithub,
  IconBrandGoogle,
  IconCertificate,
  IconLock,
  IconWorldWww,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { isApiError } from '@/api/errors';
import { describeFieldError } from '@/i18n/errors';
import { useTranslation } from 'react-i18next';

import {
  listFederationPresets,
  setFederationSecret,
  type AdminFederationPreset,
} from '@/api/endpoints/admin/federation';
import type { AdminResourceInput } from '@/api/endpoints/admin/types';
import { createAdminResource } from '@/api/endpoints/admin/resources';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';

import { adminKeys } from '../keys';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

const PRESET_ICONS: Record<string, typeof IconWorldWww> = {
  github: IconBrandGithub,
  google: IconBrandGoogle,
  oidc: IconWorldWww,
  saml: IconCertificate,
};

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function FederationPresetCreateModal({ opened, onClose }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const presets = useQuery({
    queryKey: adminKeys.federationPresets,
    queryFn: ({ signal }) => listFederationPresets(signal),
    enabled: opened,
  });

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      withCloseButton={!busy}
      title={t('admin.federation.createTitle')}
      size={720}
      withinPortal
    >
      {opened &&
        (presets.isPending ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : presets.isError || !presets.data ? (
          <SubmitErrorAlert error={presets.error} hint={t('admin.federation.presetsLoadFailed')} />
        ) : (
          <FederationPresetWizard
            presets={presets.data.presets}
            onClose={onClose}
            onPendingChange={setBusy}
          />
        ))}
    </Modal>
  );
}

function FederationPresetWizard({
  presets,
  onClose,
  onPendingChange,
}: {
  presets: AdminFederationPreset[];
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<AdminFederationPreset | null>(null);

  if (!preset) {
    return (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t('admin.federation.presetPickerHint')}
        </Text>
        {presets.map((entry) => {
          const Icon = PRESET_ICONS[entry.icon] ?? IconWorldWww;
          return (
            <Card
              key={entry.id}
              withBorder
              padding="md"
              component="button"
              type="button"
              onClick={() => setPreset(entry)}
              style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <Group gap="md">
                <ThemeIcon variant="light" size="lg">
                  <Icon size={20} />
                </ThemeIcon>
                <Box style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Title order={5}>{t(`admin.federation.preset.${entry.id}.title`)}</Title>
                    <Badge size="sm" variant="light">
                      {entry.provider_type.toUpperCase()}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t(`admin.federation.preset.${entry.id}.description`)}
                  </Text>
                </Box>
              </Group>
            </Card>
          );
        })}
      </Stack>
    );
  }

  return (
    <FederationPresetForm
      preset={preset}
      onClose={onClose}
      onBack={() => setPreset(null)}
      onPendingChange={onPendingChange}
    />
  );
}

function FederationPresetForm({
  preset,
  onClose,
  onBack,
  onPendingChange,
}: {
  preset: AdminFederationPreset;
  onClose: () => void;
  onBack: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const stepUp = useAdminStepUp();
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [scopes, setScopes] = useState<string[]>(preset.defaults?.scopes ?? []);

  const createdId = useRef<string | null>(null);
  const [draftCreated, setDraftCreated] = useState(false);
  const mutation = useMutation({
    mutationFn: async (input: AdminResourceInput) => {
      const secret = values.client_secret ?? '';
      const id =
        createdId.current ??
        (await stepUp.runWithAdminStepUp(() => createAdminResource('federation', input))).id;
      createdId.current = id;
      setDraftCreated(true);
      if (secret) {
        await stepUp.runWithAdminStepUp(() =>
          setFederationSecret(id, { reason: input.reason, secret }),
        );
      }
      setValues((current) => ({ ...current, client_secret: '' }));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.resourceKind('federation') });
      onClose();
    },
  });

  useEffect(() => {
    onPendingChange(mutation.isPending);
    return () => onPendingChange(false);
  }, [mutation.isPending, onPendingChange]);

  const fieldError = (name: string) =>
    isApiError(mutation.error)
      ? describeFieldError(mutation.error, name === 'client_secret' ? 'secret' : name)
      : undefined;
  const fixedEntries = Object.entries(preset.fixed ?? {});
  const secretField = preset.fields.find((field) => field.kind === 'secret');
  const missingRequired = preset.fields
    .filter((field) => field.required)
    .some((field) => !(values[field.name] ?? '').trim());
  const slug = preset.slug ?? (values.slug ?? '').trim();
  const slugInvalid = !preset.slug && !/^[a-z][a-z0-9-]{0,63}$/.test(slug);
  const trimmedReason = reason.trim();
  const reasonInvalid = [...trimmedReason].length > 1000;
  const nameInvalid = displayName.trim().length < 1 || [...displayName.trim()].length > 120;
  const needsScopes = preset.provider_type !== 'saml';

  const submit = () => {
    const configuration: Record<string, unknown> = {
      ...(preset.fixed ?? {}),
      display_name: displayName.trim(),
      provider_type: preset.provider_type,
      slug,
    };
    for (const field of preset.fields) {
      if (field.kind === 'secret') {
        continue;
      }
      const value = (values[field.name] ?? '').trim();
      if (value !== '') {
        configuration[field.name] = value;
      }
    }
    if (needsScopes && scopes.length > 0) {
      configuration.scopes = scopes;
    }
    mutation.mutate({ reason: trimmedReason, configuration });
  };

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Button
          variant="subtle"
          size="compact-xs"
          onClick={onBack}
          disabled={mutation.isPending || draftCreated}
        >
          {t('admin.federation.backToPresets')}
        </Button>
        <Title order={5}>{t(`admin.federation.preset.${preset.id}.title`)}</Title>
      </Group>

      {fixedEntries.length > 0 && (
        <Stack gap={4}>
          {fixedEntries.map(([key, value]) => (
            <Tooltip key={key} label={t('admin.federation.fixedFieldHint')} position="top-start">
              <TextInput
                label={t(`admin.federation.field.${key}`)}
                value={value}
                readOnly
                leftSection={<IconLock size={14} />}
                styles={{ input: { cursor: 'default' } }}
              />
            </Tooltip>
          ))}
        </Stack>
      )}

      <TextInput
        disabled={draftCreated}
        label={t('admin.resources.displayName')}
        value={displayName}
        onChange={(event) => setDisplayName(event.currentTarget.value)}
        error={nameInvalid ? t('admin.federation.displayNameInvalid') : undefined}
        data-autofocus
      />

      {!preset.slug && (
        <TextInput
          disabled={draftCreated}
          label={t('admin.federation.field.slug')}
          description={t('admin.federation.slugHint')}
          value={values.slug ?? ''}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setValues((current) => ({ ...current, slug: value }));
          }}
          error={slugInvalid ? t('admin.federation.slugInvalid') : undefined}
        />
      )}

      {preset.fields
        .filter((field) => field.kind !== 'secret' && field.name !== 'slug')
        .map((field) => (
          <TextInput
            key={field.name}
            disabled={draftCreated}
            label={`${t(`admin.federation.field.${field.name}`)}${field.required ? ' *' : ''}`}
            value={values[field.name] ?? ''}
            error={fieldError(field.name)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setValues((current) => ({ ...current, [field.name]: value }));
            }}
          />
        ))}

      {secretField && (
        <PasswordInput
          label={`${t(`admin.federation.field.${secretField.name}`)}${secretField.required ? ' *' : ''}`}
          description={t('admin.federation.secretHint')}
          value={values[secretField.name] ?? ''}
          error={fieldError('client_secret')}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setValues((current) => ({ ...current, [secretField.name]: value }));
          }}
        />
      )}

      {needsScopes && (
        <TagsInput
          disabled={draftCreated}
          label={t('admin.federation.scopes')}
          value={scopes}
          onChange={setScopes}
          clearable
        />
      )}

      <Text size="xs" c="dimmed">
        {t('admin.federation.postCreateHint')}
      </Text>

      <Textarea
        label={t('admin.reason.label')}
        description={t('admin.reason.hint')}
        placeholder={t('admin.reason.placeholder')}
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={6}
      />
      {draftCreated && mutation.isError && (
        <Text size="sm">{t('admin.federation.secretRetryHint')}</Text>
      )}
      <SubmitErrorAlert error={mutation.error} hint={t('admin.resources.createHint')} />

      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onBack} disabled={mutation.isPending || draftCreated}>
          {t('admin.federation.backToPresets')}
        </Button>
        <Button
          disabled={
            mutation.isPending || reasonInvalid || nameInvalid || slugInvalid || missingRequired
          }
          loading={mutation.isPending}
          onClick={submit}
        >
          {t('admin.resources.create')}
        </Button>
      </Group>
    </Stack>
  );
}
