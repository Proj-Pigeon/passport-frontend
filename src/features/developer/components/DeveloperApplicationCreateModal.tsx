import { Alert, Anchor, Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowRight, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { createDeveloperResource } from '@/api/endpoints/developer/resources';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import {
  APPLICATION_TYPES,
  protocolConfiguration,
  type ApplicationPreset,
  type ProtocolDraft,
} from '@/features/admin/components/resource/applicationPresets';
import { developerPanelKeys } from '../keys';
import { useStepUp } from '@/features/step-up/useStepUp';
import { useSession } from '@/features/session/useSession';

const draftDefaults: ProtocolDraft = {
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
};

export function DeveloperApplicationCreateModal({
  opened,
  onClose,
}: {
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
      title={
        <Text fw={600} size="lg">
          {t('developer.create.title')}
        </Text>
      }
      size="md"
      padding="xl"
      centered
    >
      {opened && <DeveloperApplicationCreateForm onClose={onClose} onPending={setPending} />}
    </Modal>
  );
}

function DeveloperApplicationCreateForm({
  onClose,
  onPending,
}: {
  onClose: () => void;
  onPending: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stepUp = useStepUp();
  const { user } = useSession();
  const [preset, setPreset] = useState<ApplicationPreset>('web');
  const [displayName, setDisplayName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [createdApplicationId, setCreatedApplicationId] = useState<string | null>(null);
  const createdApplication = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      onPending(true);
      try {
        return await stepUp.runWithStepUp(
          async () => {
            let applicationId = createdApplication.current;
            if (!applicationId) {
              const application = await createDeveloperResource('application', {
                configuration: {
                  display_name: displayName.trim(),
                  owner_user_id: user?.id ?? '',
                  risk: 'normal',
                  application_type: preset,
                },
              });
              applicationId = application.id;
              createdApplication.current = application.id;
              setCreatedApplicationId(application.id);
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: developerPanelKeys.resourceKind('application'),
                }),
                queryClient.invalidateQueries({ queryKey: ['developer', 'applications'] }),
                queryClient.invalidateQueries({
                  queryKey: [...developerPanelKeys.all, 'overview'],
                }),
              ]);
            }
            await createDeveloperResource(preset === 'saml' ? 'saml' : 'oauth', {
              application_id: applicationId,
              configuration: protocolConfiguration(preset, draftDefaults, displayName.trim()),
            });
            return applicationId;
          },
          { requireVerification: true },
        );
      } finally {
        onPending(false);
      }
    },
    onSuccess: async (applicationId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: developerPanelKeys.resourceKind('application') }),
        queryClient.invalidateQueries({
          queryKey: developerPanelKeys.resourceKind(preset === 'saml' ? 'saml' : 'oauth'),
        }),
        queryClient.invalidateQueries({ queryKey: ['developer', 'applications'] }),
      ]);
      onClose();
      if (applicationId)
        navigate(`/account/developer/applications/${encodeURIComponent(applicationId)}`);
    },
  });

  const disabled = mutation.isPending || createdApplicationId !== null;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const invalid = !displayName.trim() || [...displayName.trim()].length > 80;
        setNameError(invalid);
        if (!invalid && !mutation.isPending) mutation.mutate();
      }}
    >
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {t('developer.create.description')}
        </Text>
        <TextInput
          label={t('developer.create.name')}
          placeholder={t('developer.create.namePlaceholder')}
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.currentTarget.value);
            setNameError(false);
          }}
          required
          data-autofocus
          size="md"
          disabled={disabled}
          error={nameError ? t('developer.create.nameInvalid') : undefined}
        />
        <Select
          label={t('developer.create.type')}
          description={t('admin.applicationCreate.hints.' + preset)}
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          data={APPLICATION_TYPES.map((value) => ({
            value,
            label: t('admin.applicationCreate.presets.' + value),
          }))}
          value={preset}
          onChange={(value) => {
            if (value) setPreset(value as ApplicationPreset);
          }}
          allowDeselect={false}
          required
          size="md"
          disabled={disabled}
        />
        {createdApplicationId && mutation.isError ? (
          <Alert color="orange" title={t('admin.applicationCreate.partialTitle')}>
            <Text size="sm">{t('admin.applicationCreate.partialHint')}</Text>
            <Anchor
              component={Link}
              to={'/account/developer/applications/' + encodeURIComponent(createdApplicationId)}
              onClick={onClose}
              size="sm"
            >
              {t('admin.applicationCreate.viewDraft')}
            </Anchor>
          </Alert>
        ) : (
          <Alert variant="light" icon={<IconInfoCircle size={18} />}>
            {t('developer.create.draftHint')}
          </Alert>
        )}
        <SubmitErrorAlert error={mutation.error} hint={t('developer.create.hint')} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!displayName.trim()}
            rightSection={<IconArrowRight size={16} />}
          >
            {t(createdApplicationId ? 'common.retry' : 'developer.create.submit')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
