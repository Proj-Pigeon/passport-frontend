import { Alert, Badge, Switch } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/AccountSections';
import { useUpdateStepUpPreference } from '@/features/account/useProfile';
import { useSession } from '@/features/session/useSession';

export function StepUpStatusCard() {
  const { t } = useTranslation();
  const modals = useModals();
  const { user } = useSession();
  const updatePreference = useUpdateStepUpPreference();

  const enabled = user?.step_up_required ?? true;

  const disable = () => {
    modals.openConfirmModal({
      title: t('account.security.stepUpDisableTitle'),
      children: (
        <Alert color="red" variant="light">
          {t('account.security.stepUpDisableBody')}
        </Alert>
      ),
      labels: {
        confirm: t('account.security.stepUpDisableConfirm'),
        cancel: t('common.cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => updatePreference.mutate(false),
    });
  };

  return (
    <SectionCard
      title={t('account.security.stepUpTitle')}
      badge={
        <Badge size="sm" variant="light" color={enabled ? 'teal' : 'red'}>
          {enabled ? t('common.enabled') : t('common.disabled')}
        </Badge>
      }
      action={
        <Switch
          size="sm"
          aria-label={t('account.security.stepUpTitle')}
          checked={enabled}
          disabled={updatePreference.isPending}
          onChange={(event) =>
            event.currentTarget.checked ? updatePreference.mutate(true) : disable()
          }
        />
      }
    />
  );
}
