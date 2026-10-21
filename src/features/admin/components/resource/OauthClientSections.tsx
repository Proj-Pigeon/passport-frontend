import {
  ActionIcon,
  Alert,
  Button,
  Code,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminChangeRequest, AdminSecretResult } from '@/api/endpoints/admin/types';
import {
  addOauthRedirectUri,
  getAdminResource,
  patchAdminResource,
  redeemOauthClientSecret,
  redeemOauthClientSecretRotation,
  removeOauthRedirectUri,
  requestAdminActivation,
  revokeOauthClientGrants,
} from '@/api/endpoints/admin/resources';
import { isApiError } from '@/api/errors';
import { SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';

import type { ResourceSectionProps } from '../../pages/AdminResourceDetailPage';
import { hasAdminCapability, useAdminSession } from '../../session/useAdminSession';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import {
  MAX_SESSION_DURATION_HOURS,
  sessionDurationDays,
  sessionDurationSeconds,
} from './applicationPresets';
import { ReasonModal } from '../ReasonModal';
import { SecretRevealModal } from '../SecretRevealModal';

interface RedirectEntry {
  id: string;
  uri: string;
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
  const [redeemTarget, setRedeemTarget] = useState<AdminChangeRequest | null>(null);
  const [overlapSeconds, setOverlapSeconds] = useState<number>(0);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantModal, setGrantModal] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<AdminSecretResult | null>(null);
  const [sessionHours, setSessionHours] = useState<number | ''>(configuredSessionHours);
  const [sessionError, setSessionError] = useState(false);
  const [sessionModal, setSessionModal] = useState(false);

  const invalidate = refresh;

  const sessionMutation = useMutation({
    mutationFn: (reason: string) =>
      stepUp.runWithAdminStepUp(() =>
        patchAdminResource(
          'oauth',
          resource.id,
          {
            reason,
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
    mutationFn: async (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        addOauthRedirectUri(resource.id, { reason: input.reason, uri: newUri.trim() }, etag),
      ),
    onSuccess: async () => {
      setNewUri('');
      await invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (input: { reason: string; entry: RedirectEntry }) =>
      stepUp.runWithAdminStepUp(() =>
        removeOauthRedirectUri(resource.id, input.entry.id, input.reason, etag),
      ),
    onSuccess: async () => {
      setRemoveTarget(null);
      await invalidate();
    },
  });

  const grantMutation = useMutation({
    mutationFn: async (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        revokeOauthClientGrants(resource.id, {
          reason: input.reason,
          ...(grantUserId.trim() ? { user_id: grantUserId.trim() } : {}),
        }),
      ),
    onSuccess: async () => {
      setGrantModal(false);
      setGrantUserId('');
    },
  });

  const secretRequestMutation = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const parent = await getAdminResource('application', resource.application_id ?? '');
      return stepUp.runWithAdminStepUp(() =>
        requestAdminActivation(
          'application',
          resource.application_id ?? '',
          {
            reason: input.reason,
            action: secretRequest ?? 'create_secret',
            target_resource_id: resource.id,
          },
          parent.etag,
        ),
      );
    },
    onSuccess: async () => {
      setSecretRequest(null);
      await invalidate();
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (input: { reason: string }) => {
      const rotate = redeemTarget?.action === 'rotate_secret';
      const call = rotate ? redeemOauthClientSecretRotation : redeemOauthClientSecret;
      return stepUp.runWithAdminStepUp(() =>
        call(
          resource.id,
          {
            reason: input.reason,
            change_request_id: redeemTarget?.id ?? '',
            overlap_seconds: rotate ? overlapSeconds : undefined,
          },
          etag,
        ),
      );
    },
    onSuccess: (data) => {
      setRedeemTarget(null);
      setRevealedSecret(data);
      return invalidate();
    },
  });

  const approvedSecretRequests = (resource.change_requests ?? []).filter(
    (request) =>
      request.status === 'approved' &&
      (request.action === 'create_secret' || request.action === 'rotate_secret') &&
      request.requested_by === session?.user_id,
  );

  const redeemable = redeemTarget ?? approvedSecretRequests[0] ?? null;

  return (
    <>
      {!device && (
        <SectionCard
          title={t('admin.oauth.redirectCard')}
          description={t('admin.oauth.redirectHint')}
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
                    onClick={() => setRemoveTarget(entry)}
                  >
                    ×
                  </ActionIcon>
                )}
              </Group>
            ))}
            {canWrite && (
              <>
                <Divider my={4} />
                <Group gap="sm" wrap="nowrap">
                  <TextInput
                    value={newUri}
                    onChange={(event) => setNewUri(event.currentTarget.value)}
                    placeholder="https://client.example/callback"
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="xs"
                    variant="light"
                    disabled={newUri.trim().length === 0 || addMutation.isPending}
                    onClick={() => {
                      addMutation.reset();
                      setAddModal(true);
                    }}
                  >
                    {t('admin.oauth.addRedirect')}
                  </Button>
                </Group>
                <SubmitInlineError error={addMutation.error} />
              </>
            )}
          </Stack>
        </SectionCard>
      )}

      <SectionCard title={t('admin.oauth.sessionCard')} description={t('admin.oauth.sessionHint')}>
        <Stack gap="xs">
          {sessionSeconds > 0 && (
            <Text size="sm" c="dimmed">
              {t('admin.oauth.sessionCurrent', {
                hours: sessionSeconds / 3600,
                days: sessionDurationDays(sessionSeconds),
              })}
            </Text>
          )}
          <NumberInput
            label={t('admin.oauth.sessionField')}
            description={t('admin.oauth.sessionFieldHint')}
            placeholder={t('admin.oauth.sessionDefault')}
            value={sessionHours}
            onChange={(value) => {
              setSessionHours(value === '' ? '' : Number(value));
              setSessionError(false);
            }}
            min={1}
            max={MAX_SESSION_DURATION_HOURS}
            allowDecimal={false}
            clampBehavior="strict"
            disabled={!canWrite}
            error={sessionError ? t('admin.oauth.sessionInvalid') : undefined}
          />
          {canWrite && (
            <>
              <Group gap="sm">
                <Button
                  size="xs"
                  variant="light"
                  disabled={!sessionDirty || sessionMutation.isPending}
                  onClick={() => {
                    sessionMutation.reset();
                    if (!sessionHoursValid) {
                      setSessionError(true);
                      return;
                    }
                    setSessionModal(true);
                  }}
                >
                  {t('admin.oauth.sessionSave')}
                </Button>
              </Group>
              <SubmitInlineError error={sessionMutation.error} />
            </>
          )}
        </Stack>
      </SectionCard>

      <SectionCard title={t('admin.oauth.grantsCard')} description={t('admin.oauth.grantsHint')}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('admin.oauth.grantsNote')}
          </Text>
          {canWrite && (
            <>
              <Group gap="sm" wrap="nowrap">
                <TextInput
                  value={grantUserId}
                  onChange={(event) => setGrantUserId(event.currentTarget.value)}
                  placeholder={`${t('admin.oauth.grantUserPlaceholder')} (usr_…)`}
                  style={{ flex: 1 }}
                />
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => {
                    grantMutation.reset();
                    setGrantModal(true);
                  }}
                >
                  {t('admin.oauth.revokeGrants')}
                </Button>
              </Group>
              <SubmitInlineError error={grantMutation.error} />
            </>
          )}
        </Stack>
      </SectionCard>

      {isConfidential && (
        <SectionCard title={t('admin.oauth.secretCard')} description={t('admin.oauth.secretHint')}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {t('admin.oauth.secretFlow')}
            </Text>
            {canWrite && (
              <Group gap="sm">
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
                  variant="light"
                  onClick={() => {
                    secretRequestMutation.reset();
                    setSecretRequest('rotate_secret');
                  }}
                >
                  {t('admin.oauth.requestRotation')}
                </Button>
              </Group>
            )}
            <SubmitInlineError error={secretRequestMutation.error} />
            {approvedSecretRequests.length > 0 && (
              <Alert color="green" variant="light">
                <Stack gap="xs">
                  <Text size="sm">{t('admin.oauth.redeemReady')}</Text>
                  <Group gap="sm">
                    {approvedSecretRequests.map((request) => (
                      <Button
                        key={request.id}
                        size="xs"
                        onClick={() => {
                          redeemMutation.reset();
                          setRedeemTarget(request);
                          setOverlapSeconds(0);
                        }}
                      >
                        {t('admin.oauth.redeem', {
                          action: t(`admin.changeAction.${request.action}`),
                        })}
                      </Button>
                    ))}
                  </Group>
                </Stack>
              </Alert>
            )}
            <SubmitInlineError error={redeemMutation.error} />
          </Stack>
        </SectionCard>
      )}

      <ReasonModal
        opened={addModal}
        onClose={() => (addMutation.isPending ? undefined : setAddModal(false))}
        title={t('admin.oauth.addRedirect')}
        description={newUri.trim()}
        confirmLabel={t('admin.oauth.addRedirect')}
        pending={addMutation.isPending}
        error={addMutation.error}
        errorHint={
          isApiError(addMutation.error) && addMutation.error.status === 412
            ? t('admin.config.conflictHint')
            : undefined
        }
        onSubmit={(reason) => addMutation.mutate({ reason })}
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
        onSubmit={(reason) => {
          if (removeTarget) {
            removeMutation.mutate({ reason, entry: removeTarget });
          }
        }}
      />

      <ReasonModal
        opened={sessionModal}
        onClose={() => (sessionMutation.isPending ? undefined : setSessionModal(false))}
        title={t('admin.oauth.sessionSave')}
        confirmLabel={t('common.submit')}
        pending={sessionMutation.isPending}
        error={sessionMutation.error}
        errorHint={
          isApiError(sessionMutation.error) && sessionMutation.error.status === 412
            ? t('admin.config.conflictHint')
            : undefined
        }
        onSubmit={(reason) => sessionMutation.mutate(reason)}
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
        onSubmit={(reason) => grantMutation.mutate({ reason })}
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
        onSubmit={(reason) => secretRequestMutation.mutate({ reason })}
      />

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
          redeemable?.action === 'rotate_secret' ? (
            <NumberInput
              label={t('admin.oauth.overlap')}
              description={t('admin.oauth.overlapHint')}
              value={overlapSeconds}
              onChange={(value) => setOverlapSeconds(Number(value) || 0)}
              min={0}
              max={3600}
            />
          ) : undefined
        }
        onSubmit={(reason) => redeemMutation.mutate({ reason })}
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
