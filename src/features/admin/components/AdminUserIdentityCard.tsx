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
import { IconEye } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getAdminUserIdentity,
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
        identity && canWrite ? (
          <ActionIcon
            variant="light"
            aria-label={t('admin.users.identity.reveal')}
            onClick={() => openReveal(identity.id)}
          >
            <IconEye size={18} />
          </ActionIcon>
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
        <PageState kind="empty" minHeight={80} title={t('admin.users.identity.empty')} />
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
          {(query.data?.attempts.length ?? 0) > 1 && (
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
                  )}
                </Group>
              ))}
            </>
          )}
        </Stack>
      )}
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
