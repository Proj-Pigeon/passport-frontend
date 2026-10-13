import { useModals } from '@mantine/modals';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminSessionInfo } from '@/api/endpoints/admin/types';

import { adminKeys } from '../keys';
import { isAdminStepUpActive, isAdminStepUpRequired } from './adminStepUp';
import { AdminStepUpModalBody } from './AdminStepUpModalBody';

export type AdminStepUpAbortReason = 'cancelled' | 'unavailable';

export class AdminStepUpAbortedError extends Error {
  readonly reason: AdminStepUpAbortReason;

  constructor(reason: AdminStepUpAbortReason) {
    super(`Administrator step-up authentication was not completed (${reason}).`);
    this.name = 'AdminStepUpAbortedError';
    this.reason = reason;
  }
}

export function isAdminStepUpAborted(value: unknown): boolean {
  return value instanceof AdminStepUpAbortedError;
}

export interface UseAdminStepUpResult {
  isActive: boolean;
  expiresAt: string | null;
  ensureAdminStepUp: (options?: { force?: boolean }) => Promise<void>;
  runWithAdminStepUp: <T>(action: () => Promise<T>) => Promise<T>;
}

export function useAdminStepUp(): UseAdminStepUpResult {
  const modals = useModals();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const expiresAt =
    queryClient.getQueryData<AdminSessionInfo>(adminKeys.session)?.step_up_expires_at ?? null;
  const isActive = isAdminStepUpActive(expiresAt);

  const ensureAdminStepUp = useCallback(
    (options?: { force?: boolean }): Promise<void> => {
      if (!options?.force) {
        const cached = queryClient.getQueryData<AdminSessionInfo>(adminKeys.session);
        if (isAdminStepUpActive(cached?.step_up_expires_at)) {
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
            reject(new AdminStepUpAbortedError('cancelled'));
          }
        };

        let modalId = '';
        const close = () => modals.closeModal(modalId);

        modalId = modals.openModal({
          title: t('admin.stepUp.title'),
          onClose: () => settle(false),
          children: (
            <AdminStepUpModalBody
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

  async function runWithAdminStepUp<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (!isAdminStepUpRequired(error)) {
        throw error;
      }
      const cached = queryClient.getQueryData<AdminSessionInfo>(adminKeys.session);
      if (isAdminStepUpActive(cached?.step_up_expires_at)) {
        throw error;
      }
      await ensureAdminStepUp({ force: true });
      return await action();
    }
  }

  return { isActive, expiresAt, ensureAdminStepUp, runWithAdminStepUp };
}
