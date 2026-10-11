import { Button, Divider, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { IconKey, IconPlus } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Passkey } from '@/api/types';
import { SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { isWebAuthnSupported } from '@/lib/webauthn';

import {
  useDeletePasskey,
  usePasskeys,
  useRegisterPasskey,
  useRenamePasskey,
} from '../usePasskeys';
import { PasskeyRow } from './PasskeyRow';

export function PasskeySection() {
  const { t } = useTranslation();
  const modals = useModals();
  const { passkeys, isLoading, error, refetch } = usePasskeys();
  const register = useRegisterPasskey();
  const rename = useRenamePasskey();
  const remove = useDeletePasskey();
  const supported = isWebAuthnSupported();

  const confirmDelete = (passkey: Passkey) => {
    const label = passkey.label.trim().length > 0 ? passkey.label : t('account.security.unnamed');
    modals.openConfirmModal({
      title: t('account.security.deleteTitle'),
      children: <Text size="sm">{t('account.security.deleteBody', { label })}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(passkey.id),
    });
  };

  const addButton = (
    <Tooltip label={t('auth.login.passkeyUnsupported')} disabled={supported} position="bottom-end">
      <Button
        size="xs"
        variant="light"
        onClick={() => register.mutate()}
        loading={register.isPending}
        disabled={!supported || isLoading}
        leftSection={<IconPlus size={14} stroke={1.5} />}
      >
        {t('account.security.add')}
      </Button>
    </Tooltip>
  );

  let body: ReactNode;
  if (isLoading) {
    body = (
      <Stack gap="xs">
        <Skeleton height={48} />
        <Skeleton height={48} />
      </Stack>
    );
  } else if (error) {
    body = (
      <PageState
        kind="error"
        minHeight={120}
        description={describeApiError(error)}
        error={error}
        onRetry={refetch}
      />
    );
  } else if (passkeys.length === 0) {
    body = (
      <PageState
        kind="empty"
        minHeight={120}
        title={t('account.security.emptyTitle')}
        description={t('account.security.emptyBody')}
        action={
          <Button
            size="xs"
            onClick={() => register.mutate()}
            loading={register.isPending}
            disabled={!supported}
            leftSection={<IconKey size={14} stroke={1.5} />}
          >
            {t('account.security.addFirst')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <Stack gap={0}>
        {passkeys.map((passkey, index) => (
          <Stack key={passkey.id} gap={0}>
            {index > 0 && <Divider />}
            <PasskeyRow
              passkey={passkey}
              busy={rename.isPending || remove.isPending || register.isPending}
              onRename={(label) => rename.mutateAsync({ passkeyId: passkey.id, label })}
              onDelete={() => confirmDelete(passkey)}
            />
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <SectionCard
      title={t('account.security.passkeyTitle')}
      description={t('account.security.passkeyDescription')}
      action={passkeys.length > 0 || isLoading ? addButton : undefined}
    >
      {body}
    </SectionCard>
  );
}
