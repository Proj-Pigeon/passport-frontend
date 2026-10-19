import { Anchor, Stack, Text } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { getCurrentSession } from '@/api/endpoints/session';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/features/session/keys';
import { isStepUpActive } from '@/features/step-up/stepUp';
import { StepUpAbortedError, useStepUp } from '@/features/step-up/useStepUp';

export function useDeviceStepUp() {
  const modals = useModals();
  const queryClient = useQueryClient();
  const { ensureStepUp } = useStepUp();
  const { t } = useTranslation();

  async function verify(force = false) {
    const current = await getCurrentSession();
    queryClient.setQueryData(queryKeys.session, current);
    if (!current.user.step_up_required) {
      await new Promise<void>((resolve, reject) =>
        modals.openConfirmModal({
          title: t('stepUp.riskTitle'),
          children: <Text size="sm">{t('stepUp.riskBody')}</Text>,
          labels: { confirm: t('stepUp.riskConfirm'), cancel: t('common.cancel') },
          onConfirm: resolve,
          onCancel: () => reject(new StepUpAbortedError('cancelled')),
          onClose: () => reject(new StepUpAbortedError('cancelled')),
        }),
      );
      return;
    }
    if (!current.user.has_password && !current.user.has_passkey) {
      modals.openModal({
        title: t('devices.verify'),
        children: (
          <Stack>
            <Text>{t('devices.passkeyMissing')}</Text>
            <Anchor component={Link} to="/account/security" onClick={() => modals.closeAll()}>
              {t('devices.openSecurity')}
            </Anchor>
          </Stack>
        ),
      });
      throw new StepUpAbortedError('unavailable');
    }
    if (!force && isStepUpActive(current.session.step_up_expires_at)) {
      return;
    }
    await ensureStepUp({ force: true });
    await queryClient.invalidateQueries({ queryKey: queryKeys.session });
  }

  async function run<T>(action: () => Promise<T>): Promise<T> {
    await verify();
    try {
      return await action();
    } catch (error) {
      if (!isApiError(error) || error.code !== 'device_step_up_required') throw error;
      await verify(true);
      return action();
    }
  }
  return { run };
}
