import { Alert, Button, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createIdentitySession,
  getMyIdentity,
  refreshIdentitySession,
  type IdentityRecord,
} from '@/api/endpoints/account/identity';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { IdentityVerificationModal } from './IdentityVerificationModal';
import { identityKeys } from './identityVerification';

type IdentityStatus = 'verified' | 'pending' | 'rejected' | 'notVerified';

function identityStatus(identity: IdentityRecord | null): IdentityStatus {
  if (!identity) return 'notVerified';
  if (identity.review_state === 'approved' && identity.verified) return 'verified';
  if (identity.review_state === 'rejected') return 'rejected';
  if (identity.review_state === 'reset') return 'notVerified';
  if (['Expired', 'Kyc Expired', 'Abandoned'].includes(identity.status)) return 'notVerified';
  return 'pending';
}

function documentTypeKey(type: string): string | null {
  const normalized = type.trim().toLowerCase();
  if (['id card', 'id', 'national id', 'identity card'].includes(normalized)) {
    return 'account.identity.documentTypes.idCard';
  }
  if (['passport', 'p'].includes(normalized)) return 'account.identity.documentTypes.passport';
  if (["driver's license", 'drivers license', 'driving license', 'dl'].includes(normalized)) {
    return 'account.identity.documentTypes.driverLicense';
  }
  if (['residence permit', 'rp'].includes(normalized)) {
    return 'account.identity.documentTypes.residencePermit';
  }
  return null;
}

function IdentityCardFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Stack gap="md">
        <Title order={2} fz={16} fw={600}>
          {t('account.identity.title')}
        </Title>
        {children}
      </Stack>
    </Paper>
  );
}

function IdentityField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      <Paper withBorder radius="md" px="sm" py={8}>
        <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>
          {value}
        </Text>
      </Paper>
    </Stack>
  );
}

export function IdentityVerificationCard() {
  const { t } = useTranslation();
  const modals = useModals();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: identityKeys.all,
    queryFn: ({ signal }) => getMyIdentity(signal),
  });
  const create = useMutation({ mutationFn: createIdentitySession });

  const openSession = async () => {
    const session = await create.mutateAsync();
    let modalId = '';
    const close = () => modals.closeModal(modalId);
    modalId = modals.openModal({
      title: t('account.identity.modalTitle'),
      closeOnClickOutside: false,
      children: (
        <IdentityVerificationModal
          session={session}
          onClose={close}
          onRefresh={async (id) => {
            const result = await refreshIdentitySession(id);
            queryClient.setQueryData(identityKeys.all, result);
            await queryClient.invalidateQueries({ queryKey: identityKeys.all });
            return result;
          }}
        />
      ),
    });
  };

  if (query.isPending) {
    return (
      <IdentityCardFrame>
        <Stack gap="sm">
          <Skeleton height={54} radius="md" />
          <Skeleton height={54} radius="md" />
          <Skeleton height={40} radius="md" />
        </Stack>
      </IdentityCardFrame>
    );
  }

  if (query.isError) {
    return (
      <IdentityCardFrame>
        <PageState
          kind="error"
          minHeight={120}
          description={describeApiError(query.error)}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </IdentityCardFrame>
    );
  }

  if (!query.data.enabled) return null;

  const identity = query.data.identity;
  const reverificationRequest = query.data.reverification_request;
  const status = identityStatus(identity);
  const verified = status === 'verified';
  const canContinue = Boolean(identity && status === 'pending');
  const canStartRequested = Boolean(reverificationRequest && !canContinue);
  const hint =
    status === 'pending'
      ? t('account.identity.pendingHint')
      : status === 'rejected'
        ? t('account.identity.rejectedHint')
        : t('account.identity.unverifiedHint');
  const documentTypeTranslationKey = identity?.document_type
    ? documentTypeKey(identity.document_type)
    : null;
  const documentType = identity?.document_type
    ? documentTypeTranslationKey
      ? t(documentTypeTranslationKey)
      : identity.document_type
    : '—';
  const verifiedAt = identity ? formatDateTime(identity.decision_at) : null;

  return (
    <IdentityCardFrame>
      <Stack gap="sm">
        <IdentityField
          label={t('account.identity.currentStatus')}
          value={t(`account.identity.status.${status}`)}
        />

        {verified && identity && (
          <>
            <IdentityField
              label={t('account.identity.legalName')}
              value={identity.full_name_mask || '—'}
            />
            <IdentityField label={t('account.identity.documentType')} value={documentType} />
            <IdentityField
              label={t('account.identity.documentNumber')}
              value={identity.document_number_mask || '—'}
            />
            <IdentityField
              label={t('account.identity.channel')}
              value={t('account.identity.channelValue')}
            />
          </>
        )}

        {!verified && (
          <Text size="sm" c="dimmed">
            {hint}
          </Text>
        )}

        {reverificationRequest && (
          <Alert color="orange" title={t('account.identity.reverification.title')}>
            {reverificationRequest.reason || t('account.identity.reverification.description')}
          </Alert>
        )}

        {create.isError && (
          <Alert color="red" title={t('account.identity.sessionUnavailable')}>
            <Stack gap={4}>
              <Text size="sm">{describeApiError(create.error)}</Text>
              <Text size="sm">{t('account.identity.sessionUnavailableHint')}</Text>
            </Stack>
          </Alert>
        )}

        {verified && !reverificationRequest ? (
          <Group justify="flex-start" align="center" gap="sm" wrap="wrap">
            {verifiedAt && (
              <Text size="xs" c="dimmed">
                {t('account.identity.verifiedAt', { time: verifiedAt })}
              </Text>
            )}
          </Group>
        ) : canContinue || canStartRequested || (!identity && !reverificationRequest) ? (
          <Button
            fullWidth
            size="md"
            loading={create.isPending}
            onClick={() => void openSession().catch(() => undefined)}
          >
            {t(`account.identity.${canContinue ? 'continue' : 'start'}`)}
          </Button>
        ) : null}
      </Stack>
    </IdentityCardFrame>
  );
}
