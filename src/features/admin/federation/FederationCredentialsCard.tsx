import { Badge, Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { clearFederationSecret, setFederationSecret } from '@/api/endpoints/admin/federation';
import { patchAdminResource } from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';

import type { ResourceSectionProps } from '../components/resource/resourceTypes';
import { useAdminStepUp } from '../step-up/useAdminStepUp';
import { ReasonModal } from '../components/ReasonModal';

export function FederationCredentialsCard({
  resource,
  etag,
  refresh,
  canWrite = true,
}: ResourceSectionProps) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const providerType =
    typeof resource.configuration['provider_type'] === 'string'
      ? (resource.configuration['provider_type'] as string)
      : '';
  const [clientId, setClientId] = useState(
    typeof resource.configuration['client_id'] === 'string'
      ? (resource.configuration['client_id'] as string)
      : '',
  );
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState<null | { action: 'set' | 'clear' | 'clientId' }>(null);

  const secretSet = resource.secret_set === true;
  const secretRef =
    typeof resource.configuration['client_secret_ref'] === 'string'
      ? (resource.configuration['client_secret_ref'] as string)
      : '';
  const isSaml = providerType === 'saml';
  const clientIdDirty =
    clientId.trim() !==
    (typeof resource.configuration['client_id'] === 'string'
      ? (resource.configuration['client_id'] as string)
      : '');

  const clientIdMutation = useMutation({
    mutationFn: async (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        patchAdminResource(
          'federation',
          resource.id,
          { ...input, configuration: { client_id: clientId.trim() } },
          etag,
        ),
      ),
    onSuccess: async () => {
      setConfirm(null);
      await refresh();
    },
  });

  const setMutation = useMutation({
    mutationFn: async (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        setFederationSecret(resource.id, { reason: input.reason, secret }),
      ),
    onSuccess: async () => {
      setConfirm(null);
      setSecret('');
      await refresh();
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() => clearFederationSecret(resource.id, input)),
    onSuccess: async () => {
      setConfirm(null);
      await refresh();
    },
  });

  const pending = clientIdMutation.isPending || setMutation.isPending || clearMutation.isPending;
  const error = clientIdMutation.error ?? setMutation.error ?? clearMutation.error;

  if (isSaml) {
    return null;
  }

  return (
    <SectionCard
      title={t('admin.federation.credentialsCard')}
      description={t('admin.federation.credentialsHint')}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end">
          <TextInput
            label={t('admin.federation.field.client_id')}
            readOnly={!canWrite}
            value={clientId}
            onChange={(event) => setClientId(event.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            size="xs"
            disabled={!canWrite || !clientIdDirty}
            onClick={() => setConfirm({ action: 'clientId' })}
          >
            {t('common.save')}
          </Button>
        </Group>

        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="sm">{t('admin.federation.secretStatus')}</Text>
            {secretSet ? (
              <Badge color="green" variant="light">
                {t('admin.federation.secretSet')}
              </Badge>
            ) : secretRef ? (
              <Badge color="blue" variant="light">
                {t('admin.federation.secretRefBadge', { ref: secretRef })}
              </Badge>
            ) : (
              <Badge color="red" variant="light">
                {t('admin.federation.secretMissing')}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {secretSet && (
              <Button
                size="xs"
                color="red"
                variant="light"
                disabled={!canWrite}
                onClick={() => setConfirm({ action: 'clear' })}
              >
                {t('admin.federation.secretClear')}
              </Button>
            )}
            <Button
              size="xs"
              variant="light"
              disabled={!canWrite}
              onClick={() => setConfirm({ action: 'set' })}
            >
              {secretSet
                ? t('admin.federation.secretReplace')
                : t('admin.federation.secretSetAction')}
            </Button>
          </Group>
        </Group>

        {secret !== '' && confirm === null && (
          <Text size="xs" c="dimmed">
            {t('admin.federation.secretPendingHint')}
          </Text>
        )}
      </Stack>

      <ReasonModal
        opened={confirm !== null}
        onClose={() => {
          if (!pending) {
            setConfirm(null);
            setSecret('');
          }
        }}
        title={
          confirm?.action === 'clear'
            ? t('admin.federation.secretClear')
            : confirm?.action === 'set'
              ? t('admin.federation.secretSetAction')
              : t('admin.federation.saveClientId')
        }
        description={
          confirm?.action === 'set'
            ? t('admin.federation.secretSetConfirm')
            : confirm?.action === 'clear'
              ? t('admin.federation.secretClearConfirm')
              : t('admin.federation.connectionConfirm')
        }
        confirmLabel={t('common.submit')}
        pending={pending}
        error={error}
        extraFields={
          confirm?.action === 'set' ? (
            <PasswordInput
              label={t('admin.federation.field.client_secret')}
              description={t('admin.federation.secretInputHint')}
              value={secret}
              onChange={(event) => setSecret(event.currentTarget.value)}
              data-autofocus
            />
          ) : undefined
        }
        onSubmit={(reason) => {
          if (confirm?.action === 'set') {
            if (secret.trim().length === 0) {
              return;
            }
            setMutation.mutate({ reason });
          } else if (confirm?.action === 'clear') {
            clearMutation.mutate({ reason });
          } else if (confirm?.action === 'clientId') {
            clientIdMutation.mutate({ reason });
          }
        }}
      />
    </SectionCard>
  );
}
