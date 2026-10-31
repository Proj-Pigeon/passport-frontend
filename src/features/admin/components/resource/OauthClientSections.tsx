import {
  ActionIcon,
  Alert,
  Button,
  Code,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminSecretResult } from '@/api/endpoints/admin/types';
import {
  addOauthRedirectUri,
  patchAdminResource,
  redeemOauthClientSecret,
  redeemOauthClientSecretRotation,
  removeOauthRedirectUri,
  revokeOauthClientGrants,
} from '@/api/endpoints/admin/resources';
import { isApiError } from '@/api/errors';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';

import { hasAdminCapability, useAdminSession } from '../../session/useAdminSession';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import {
  MAX_SESSION_DURATION_HOURS,
  sessionDurationDays,
  sessionDurationSeconds,
} from './applicationPresets';
import { ReasonModal } from '../ReasonModal';
import { SecretRevealModal } from '../SecretRevealModal';
import type { ResourceSectionProps } from './resourceTypes';

interface RedirectEntry {
  id: string;
  uri: string;
}

export function OauthSecretRedeemBanner({
  resource,
  etag,
  refresh,
}: Pick<ResourceSectionProps, 'resource' | 'etag' | 'refresh'>) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const { data: session } = useAdminSession();
  const [redeemTarget, setRedeemTarget] = useState<'create_secret' | 'rotate_secret' | null>(null);
  const [overlapSeconds, setOverlapSeconds] = useState<number>(0);
  const [revealedSecret, setRevealedSecret] = useState<AdminSecretResult | null>(null);

  const canWrite = hasAdminCapability(session, 'applications:write');
  const secretActions = ['create_secret', 'rotate_secret'] as const;

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const rotate = redeemTarget === 'rotate_secret';
      const call = rotate ? redeemOauthClientSecretRotation : redeemOauthClientSecret;
      return stepUp.runWithAdminStepUp(() =>
        call(
          resource.id,
          {
            overlap_seconds: rotate ? overlapSeconds : undefined,
          },
          etag,
        ),
      );
    },
    onSuccess: (data) => {
      setRedeemTarget(null);
      setRevealedSecret(data);
      return refresh();
    },
  });

  if (!canWrite || resource.configuration['client_type'] !== 'confidential') return null;

  return (
    <>
      {canWrite && (
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
      )}
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

export function OauthClientSections({
  resource,
  etag,
  refresh,
  device = false,
}: ResourceSectionProps & { device?: boolean }) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const { data: session } = useAdminSession();
  const canWrite = hasAdminCapability(session, 'applications:write');

  const redirectUris =
    (resource.configuration['redirect_uris'] as RedirectEntry[] | undefined) ?? [];
  const isConfidential = resource.configuration['client_type'] === 'confidential';
  const sessionSeconds = Number(resource.configuration['refresh_token_ttl_seconds']) || 0;
  const configuredSessionHours = sessionSeconds > 0 ? sessionSeconds / 3600 : '';

  const [newUri, setNewUri] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<RedirectEntry | null>(null);
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
      stepUp.runWithAdminStepUp(() =>
        patchAdminResource(
          'oauth',
          resource.id,
          {
            configuration: { refresh_token_ttl_seconds: sessionDurationSeconds(sessionHours) },
          },
          etag,
        ),
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
      stepUp.runWithAdminStepUp(() =>
        addOauthRedirectUri(resource.id, { uri: newUri.trim() }, etag),
      ),
    onSuccess: async () => {
      setAddModal(false);
      setNewUri('');
      await invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (input: { entry: RedirectEntry }) =>
      stepUp.runWithAdminStepUp(() => removeOauthRedirectUri(resource.id, input.entry.id, etag)),
    onSuccess: async () => {
      setRemoveTarget(null);
      await invalidate();
    },
  });

  const grantMutation = useMutation({
    mutationFn: async () =>
      stepUp.runWithAdminStepUp(() =>
        revokeOauthClientGrants(resource.id, {
          ...(grantUserId.trim() ? { user_id: grantUserId.trim() } : {}),
        }),
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
      stepUp.runWithAdminStepUp(() =>
        (secretRequest === 'rotate_secret'
          ? redeemOauthClientSecretRotation
          : redeemOauthClientSecret)(
          resource.id,
          { overlap_seconds: secretRequest === 'rotate_secret' ? overlapSeconds : undefined },
          etag,
        ),
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
            canWrite ? (
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
            ) : undefined
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
                {canWrite && (
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
                )}
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
            canWrite ? (
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
            ) : undefined
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
            canWrite ? (
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
            ) : undefined
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
            canWrite ? (
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
            ) : undefined
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
        errorHint={
          isApiError(addMutation.error) && addMutation.error.status === 412
            ? t('admin.config.conflictHint')
            : undefined
        }
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
        errorHint={
          isApiError(removeMutation.error) && removeMutation.error.status === 412
            ? t('admin.config.conflictHint')
            : undefined
        }
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
        errorHint={
          isApiError(sessionMutation.error) && sessionMutation.error.status === 412
            ? t('admin.config.conflictHint')
            : undefined
        }
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
