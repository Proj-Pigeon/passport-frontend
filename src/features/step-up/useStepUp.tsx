import { useModals } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@mantine/core';

import type { CurrentSessionResponse } from '@/api/types';
import { useSession } from '@/features/session/useSession';
import { queryKeys } from '@/features/session/keys';
import { secondsUntil } from '@/lib/format';

import { StepUpModalBody } from './StepUpModal';
import { isStepUpActive, isStepUpRequired } from './stepUp';

export type StepUpAbortReason = 'cancelled' | 'unavailable';

export class StepUpAbortedError extends Error {
  readonly reason: StepUpAbortReason;

  constructor(reason: StepUpAbortReason) {
    super(`Step-up authentication was not completed (${reason}).`);
    this.name = 'StepUpAbortedError';
    this.reason = reason;
  }
}

export function isStepUpAborted(value: unknown): boolean {
  return value instanceof StepUpAbortedError;
}

export interface StepUpRunOptions {
  requireUpfront?: boolean;
  retryOnForbidden?: boolean;
}

export interface UseStepUpResult {
  isActive: boolean;
  expiresAt: string | null;
  remainingSeconds: number;
  stepUpRequired: boolean;
  ensureStepUp: (options?: { force?: boolean }) => Promise<void>;
  runWithStepUp: <T>(action: () => Promise<T>, options?: StepUpRunOptions) => Promise<T>;
}

export function useStepUp(): UseStepUpResult {
  const modals = useModals();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { session, user } = useSession();

  const expiresAt = session?.step_up_expires_at ?? null;
  const isActive = isStepUpActive(expiresAt);
  const remainingSeconds = secondsUntil(expiresAt);
  const stepUpRequired = user?.step_up_required ?? true;

  const ensureStepUp = useCallback(
    (options?: { force?: boolean }): Promise<void> => {
      if (!options?.force) {
        const cached = queryClient.getQueryData<CurrentSessionResponse>(queryKeys.session);
        if (isStepUpActive(cached?.session.step_up_expires_at)) {
          return Promise.resolve();
        }
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (verified: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          if (verified) {
            resolve();
          } else {
            reject(new StepUpAbortedError('cancelled'));
          }
        };

        let modalId = '';
        const close = () => modals.closeModal(modalId);

        modalId = modals.openModal({
          title: t('stepUp.title'),
          onClose: () => settle(false),
          children: (
            <StepUpModalBody
              close={close}
              onVerified={() => {
                settle(true);
                close();
              }}
            />
          ),
        });
      });
    },
    [modals, queryClient, t],
  );

  const confirmRiskyAction = useCallback((): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      modals.openConfirmModal({
        title: t('stepUp.riskTitle'),
        children: <Text size="sm">{t('stepUp.riskBody')}</Text>,
        labels: { confirm: t('stepUp.riskConfirm'), cancel: t('common.cancel') },
        confirmProps: { color: 'red' },
        onConfirm: () => resolve(),
        onCancel: () => reject(new StepUpAbortedError('cancelled')),
        onClose: () => reject(new StepUpAbortedError('cancelled')),
      });
    });
  }, [modals, t]);

  async function runWithStepUp<T>(
    action: () => Promise<T>,
    options?: StepUpRunOptions,
  ): Promise<T> {
    if (!stepUpRequired) {
      await confirmRiskyAction();
      return await action();
    }
    if (options?.requireUpfront) {
      await ensureStepUp();
    }
    try {
      return await action();
    } catch (error) {
      if (options?.retryOnForbidden === false || !isStepUpRequired(error)) {
        throw error;
      }
      await ensureStepUp({ force: true });
      return await action();
    }
  }

  return { isActive, expiresAt, remainingSeconds, stepUpRequired, ensureStepUp, runWithStepUp };
}
