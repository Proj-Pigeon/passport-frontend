import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { resetCsrfToken } from '@/api/csrf';
import { logoutCurrentSession } from '@/api/endpoints/session';

export function useLogout() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => logoutCurrentSession(),
    onSettled: () => {
      resetCsrfToken();
      queryClient.clear();
    },
    onSuccess: () => {
      notifications.show({ color: 'teal', message: t('session.logoutSuccess') });
    },
    onError: () => {
      notifications.show({ color: 'red', message: t('session.logoutFailed') });
    },
  });
}
