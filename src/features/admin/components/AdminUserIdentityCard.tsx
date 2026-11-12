import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Image,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { IconEye, IconLink, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getAdminUserIdentity,
  bindAdminUserIdentity,
  requestAdminUserIdentityReverification,
  cancelAdminUserIdentityReverification,
  deleteAdminUserIdentity,
  revealAdminUserIdentity,
  reviewAdminUserIdentity,
  type AdminIdentityReviewDecision,
} from '@/api/endpoints/account/identity';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { adminKeys } from '../keys';
import { useAdminStepUp } from '../step-up/useAdminStepUp';
import { ReasonModal } from './ReasonModal';

export function AdminUserIdentityCard({
  userId,
  canWrite,
  isSelf,
}: {
  userId: string;
  canWrite: boolean;
  isSelf: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const stepUp = useAdminStepUp();
  const [revealing, setRevealing] = useState(false);
  const [action, setAction] = useState<{
    id: string;
    decision: AdminIdentityReviewDecision;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const query = useQuery({
    queryKey: [...adminKeys.user(userId), 'identity'],
    queryFn: ({ signal }) => getAdminUserIdentity(userId, signal),
  });
  const reveal = useMutation({
    mutationFn: (id: string) =>
      stepUp.runWithAdminStepUp(() => revealAdminUserIdentity(userId, id)),
    gcTime: 0,
  });
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: AdminIdentityReviewDecision }) =>
      stepUp.runWithAdminStepUp(() => reviewAdminUserIdentity(userId, id, decision, reason)),
    onSuccess: async () => {
      setAction(null);
      reveal.reset();
      setRevealing(false);
      await queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) });
    },
  });
  const requestReverification = useMutation({
    mutationFn: () =>
      stepUp.runWithAdminStepUp(() =>
        requestAdminUserIdentityReverification(userId, requestReason),
      ),
    onSuccess: async () => {
      setRequestOpen(false);
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.user(userId), 'identity'] });
    },
  });
  const cancelReverification = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      stepUp.runWithAdminStepUp(() => cancelAdminUserIdentityReverification(userId, id, reason)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...adminKeys.user(userId), 'identity'] }),
  });
  const remove = useMutation({
    mutationFn: ({ id, reason: value }: { id: string; reason: string }) =>
      stepUp.runWithAdminStepUp(() => deleteAdminUserIdentity(userId, id, value)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...adminKeys.user(userId), 'identity'] }),
  });
  const bind = useMutation({
    mutationFn: ({ id, reason: value }: { id: string; reason: string }) =>
      stepUp.runWithAdminStepUp(() => bindAdminUserIdentity(userId, id, value)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...adminKeys.user(userId), 'identity'] }),
  });
  const identity = query.data?.identity;
  const closeReveal = () => {
    setRevealing(false);
    reveal.reset();
  };
  const openReveal = (id: string) => {
    reveal.reset();
    setRevealing(true);
    reveal.mutate(id);
  };
  const openReview = (id: string, decision: AdminIdentityReviewDecision) => {
    review.reset();
    setReason('');
    setAction({ id, decision });
  };

  return (
    <SectionCard
      title={t('admin.users.identity.title')}
      action={
        canWrite ? (
          <Group gap="xs">
            {identity && (
              <ActionIcon
                variant="light"
                aria-label={t('admin.users.identity.reveal')}
                onClick={() => openReveal(identity.id)}
              >
                <IconEye size={18} />
              </ActionIcon>
            )}
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                setRequestReason('');
                requestReverification.reset();
                setRequestOpen(true);
              }}
            >
              {t('admin.users.identity.request')}
            </Button>
          </Group>
        ) : undefined
      }
    >
      {query.isPending ? (
        <PageState kind="loading" minHeight={80} />
      ) : query.isError ? (
        <PageState
          kind="error"
          minHeight={80}
          error={query.error}
          description={describeApiError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : !identity ? (
        <Stack gap="sm">
          <PageState kind="empty" minHeight={80} title={t('admin.users.identity.empty')} />
          {canWrite && query.data.reverification_request && (
            <Group justify="space-between" gap="xs">
              <Text size="xs" c="dimmed">
                {t('admin.users.identity.requestPending')}
              </Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={t('admin.users.identity.cancelRequest')}
                onClick={() =>
                  cancelReverification.mutate({
                    id: query.data.reverification_request!.id,
                    reason: t('admin.users.identity.cancelRequestReason'),
                  })
                }
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          <SimpleGrid cols={2}>
            <InfoItem label={t('admin.users.identity.status')}>
              <Badge
                color={
                  identity.verified ? 'teal' : identity.review_state === 'rejected' ? 'red' : 'gray'
                }
                variant="light"
              >
                {t(`admin.users.identity.reviewStates.${identity.review_state}`)}
              </Badge>
            </InfoItem>
            <InfoItem label={t('admin.users.identity.fullName')}>
              <Text size="sm">{identity.full_name_mask || '—'}</Text>
            </InfoItem>
            <InfoItem label={t('admin.users.identity.documentNumber')}>
              <Text size="sm">{identity.document_number_mask || '—'}</Text>
            </InfoItem>
            <InfoItem label={t('admin.users.identity.documentType')}>
              <Text size="sm">{identity.document_type || '—'}</Text>
            </InfoItem>
            <InfoItem label={t('admin.users.identity.issuingCountry')}>
              <Text size="sm">{identity.issuing_country || '—'}</Text>
            </InfoItem>
            <InfoItem label={t('admin.users.identity.decisionAt')}>
              <Text size="sm">{formatDateTime(identity.decision_at) ?? '—'}</Text>
            </InfoItem>
          </SimpleGrid>
          {canWrite && !isSelf && (
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="teal"
                disabled={identity.review_state === 'reset'}
                onClick={() => openReview(identity.id, 'approve')}
              >
                {t('admin.users.identity.approve')}
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                disabled={identity.review_state === 'reset'}
                onClick={() => openReview(identity.id, 'reject')}
              >
                {t('admin.users.identity.reject')}
              </Button>
              <Button size="xs" variant="default" onClick={() => openReview(identity.id, 'reset')}>
                {t('admin.users.identity.reset')}
              </Button>
            </Group>
          )}
          {canWrite && query.data?.reverification_request && (
            <Group justify="space-between" gap="xs">
              <Text size="xs" c="dimmed">
                {t('admin.users.identity.requestPending')}
              </Text>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                aria-label={t('admin.users.identity.cancelRequest')}
                onClick={() =>
                  cancelReverification.mutate({
                    id: query.data.reverification_request!.id,
                    reason: t('admin.users.identity.cancelRequestReason'),
                  })
                }
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          )}
          {(query.data?.attempts.length ?? 0) > 0 && (
            <>
              <Divider />
              <Text size="sm" fw={500}>
                {t('admin.users.identity.attempts')}
              </Text>
              {query.data?.attempts.map((attempt) => (
                <Group key={attempt.id} justify="space-between" gap="xs">
                  <Text size="xs">
                    {formatDateTime(attempt.created_at)} ·{' '}
                    {t(`admin.users.identity.reviewStates.${attempt.review_state}`)}
                  </Text>
                  {canWrite && (
                    <Group gap={2}>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={t('admin.users.identity.revealAttempt', {
                          time: formatDateTime(attempt.created_at),
                        })}
                        onClick={() => openReveal(attempt.id)}
                      >
                        <IconEye size={14} />
                      </ActionIcon>
                      {attempt.verified && attempt.id !== identity?.id && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          aria-label={t('admin.users.identity.bind')}
                          onClick={() =>
                            bind.mutate({
                              id: attempt.id,
                              reason: t('admin.users.identity.bindReason'),
                            })
                          }
                        >
                          <IconLink size={14} />
                        </ActionIcon>
                      )}
                      {attempt.review_state !== 'approved' && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label={t('admin.users.identity.delete')}
                          onClick={() =>
                            remove.mutate({
                              id: attempt.id,
                              reason: t('admin.users.identity.deleteReason'),
                            })
                          }
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                  )}
                </Group>
              ))}
            </>
          )}
        </Stack>
      )}
      <Modal
        opened={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={t('admin.users.identity.request')}
      >
        <Stack>
          <Textarea
            label={t('admin.users.identity.reason')}
            value={requestReason}
            onChange={(event) => setRequestReason(event.currentTarget.value)}
            required
          />
          {requestReverification.isError && (
            <Text size="sm" c="red">
              {describeApiError(requestReverification.error)}
            </Text>
          )}
          <Button
            loading={requestReverification.isPending}
            disabled={!requestReason.trim()}
            onClick={() => requestReverification.mutate()}
          >
            {t('admin.users.identity.request')}
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={revealing}
        onClose={closeReveal}
        title={t('admin.users.identity.reveal')}
        size="lg"
      >
        {reveal.isPending ? (
          <PageState kind="loading" minHeight={80} />
        ) : reveal.isError ? (
          <PageState
            kind="error"
            error={reveal.error}
            description={describeApiError(reveal.error)}
            minHeight={80}
          />
        ) : (
          reveal.data && (
            <Stack gap="md">
              <Alert color="orange">{t('admin.users.identity.audited')}</Alert>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <InfoItem label={t('admin.users.identity.fullName')}>
                  <Text size="sm">{reveal.data.full_name || '—'}</Text>
                </InfoItem>
                <InfoItem label={t('admin.users.identity.documentNumber')}>
                  <Text size="sm">{reveal.data.document_number || '—'}</Text>
                </InfoItem>
                <InfoItem label={t('admin.users.identity.dateOfBirth')}>
                  <Text size="sm">{reveal.data.date_of_birth || '—'}</Text>
                </InfoItem>
                <InfoItem label={t('admin.users.identity.documentType')}>
                  <Text size="sm">{reveal.data.document_type || '—'}</Text>
                </InfoItem>
                <InfoItem label={t('admin.users.identity.issuingCountry')}>
                  <Text size="sm">{reveal.data.issuing_country || '—'}</Text>
                </InfoItem>
              </SimpleGrid>
              <SimpleGrid cols={2}>
                {reveal.data.images
                  .filter((image) => {
                    try {
                      return new URL(image.url).protocol === 'https:';
                    } catch {
                      return false;
                    }
                  })
                  .map((image) => (
                    <Anchor
                      key={image.kind}
                      href={image.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      <Image
                        src={image.url}
                        alt={t(`admin.users.identity.images.${image.kind}`)}
                        referrerPolicy="no-referrer"
                        fit="contain"
                        h={140}
                      />
                      <Text size="xs">{t(`admin.users.identity.images.${image.kind}`)}</Text>
                    </Anchor>
                  ))}
              </SimpleGrid>
            </Stack>
          )
        )}
      </Modal>
      <ReasonModal
        opened={action !== null}
        onClose={() => setAction(null)}
        title={action ? t(`admin.users.identity.${action.decision}`) : ''}
        confirmLabel={action ? t(`admin.users.identity.${action.decision}`) : ''}
        confirmColor={action?.decision === 'reject' ? 'red' : undefined}
        confirmDisabled={!reason.trim()}
        pending={review.isPending}
        error={review.error}
        extraFields={
          <Textarea
            label={t('admin.users.identity.reason')}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={1000}
            required
          />
        }
        onSubmit={() => {
          if (action) review.mutate(action);
        }}
      />
    </SectionCard>
  );
}
