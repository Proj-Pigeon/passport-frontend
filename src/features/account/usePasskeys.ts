import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { deletePasskey, listPasskeys, renamePasskey } from '@/api/endpoints/passkeys';
import { isApiError, isUnauthorized } from '@/api/errors';
import type { Passkey } from '@/api/types';
import { isStepUpAborted, useStepUp } from '@/features/step-up/useStepUp';
import { queryKeys } from '@/features/session/keys';
import { describeApiError } from '@/i18n/errors';
import { isPasskeyCancelled, registerPasskey } from '@/lib/webauthn';

export interface UsePasskeysResult {
  passkeys: Passkey[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function usePasskeys(): UsePasskeysResult {
  const query = useQuery({
    queryKey: queryKeys.passkeys,
    queryFn: ({ signal }) => listPasskeys(signal),
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 1,
  });

  return {
    passkeys: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => query.refetch(),
  };
}

export function isSilentPasskeyFailure(error: unknown): boolean {
  return isStepUpAborted(error) || isPasskeyCancelled(error);
}

export function useRegisterPasskey() {
  const queryClient = useQueryClient();
  const { runWithStepUp } = useStepUp();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => runWithStepUp(() => registerPasskey()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.passkeys });
      notifications.show({ color: 'teal', message: t('account.security.addSuccess') });
    },
    onError: (error) => {
      if (isSilentPasskeyFailure(error)) {
        return;
      }
      const message =
        isApiError(error) && error.status === 409
          ? t('account.security.alreadyRegistered')
          : describeApiError(error);
      notifications.show({ color: 'red', message });
    },
  });
}

export function useRenamePasskey() {
  const queryClient = useQueryClient();
  const { runWithStepUp } = useStepUp();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ passkeyId, label }: { passkeyId: string; label: string }) =>
      runWithStepUp(() => renamePasskey(passkeyId, label), {
        requireUpfront: true,
        retryOnForbidden: false,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Passkey[]>(queryKeys.passkeys, (current = []) =>
        current.map((passkey) => (passkey.id === updated.id ? updated : passkey)),
      );
      notifications.show({ color: 'teal', message: t('account.security.renameSuccess') });
    },
    onError: (error) => {
      if (isSilentPasskeyFailure(error)) {
        return;
      }
      notifications.show({ color: 'red', message: describeApiError(error) });
    },
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();
  const { runWithStepUp } = useStepUp();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (passkeyId: string) =>
      runWithStepUp(() => deletePasskey(passkeyId), {
        requireUpfront: true,
        retryOnForbidden: false,
      }),
    onSuccess: (_result, passkeyId) => {
      queryClient.setQueryData<Passkey[]>(queryKeys.passkeys, (current = []) =>
        current.filter((passkey) => passkey.id !== passkeyId),
      );
      notifications.show({ color: 'teal', message: t('account.security.deleteSuccess') });
    },
    onError: (error) => {
      if (isSilentPasskeyFailure(error)) {
        return;
      }
      const message =
        isApiError(error) && error.status === 403
          ? t('account.security.deleteBlocked')
          : describeApiError(error);
      notifications.show({ color: 'red', message });
    },
  });
}
