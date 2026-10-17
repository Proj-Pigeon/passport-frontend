import { Anchor, Stack, Text } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { listPasskeys } from '@/api/endpoints/passkeys';
import { getCurrentSession } from '@/api/endpoints/session';
import { isApiError } from '@/api/errors';
import { PasswordVerification } from './PasswordVerification';
import { queryKeys } from '@/features/session/keys';
import { StepUpAbortedError, useStepUp } from '@/features/step-up/useStepUp';
import { isStepUpActive } from '@/features/step-up/stepUp';

export function useDeviceStepUp() {
  const modals = useModals();
  const queryClient = useQueryClient();
  const passkey = useStepUp();
  const { t } = useTranslation();

  async function verify(force = false) {
    const [current, keys] = await Promise.all([getCurrentSession(), listPasskeys()]);
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
    const method = keys.length > 0 ? 'passkey' : 'password';
    if (
      !force &&
      current.session.step_up_method === method &&
      isStepUpActive(current.session.step_up_expires_at)
    )
      return;
    if (keys.length > 0) {
      await passkey.ensureStepUp({ force });
      return;
    }
    if (!current.user.has_password) {
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
    await new Promise<void>((resolve, reject) => {
      let complete = false;
      const id = modals.openModal({
        title: t('devices.verify'),
        closeOnClickOutside: false,
        onClose: () => {
          if (!complete) reject(new StepUpAbortedError('cancelled'));
        },
        children: (
          <PasswordVerification
            verified={() => {
              complete = true;
              resolve();
              modals.closeModal(id);
            }}
          />
        ),
      });
    });
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
