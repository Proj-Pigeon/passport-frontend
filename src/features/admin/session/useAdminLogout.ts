import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { resetCsrfToken } from '@/api/csrf';
import { logoutAdminSession } from '@/api/endpoints/admin/session';

import { ADMIN_QUERY_ROOT } from '../keys';

export function useAdminLogout() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => logoutAdminSession(),
    onSettled: () => {
      resetCsrfToken('admin');
      queryClient.removeQueries({ queryKey: ADMIN_QUERY_ROOT });
    },
    onSuccess: () => {
      notifications.show({ color: 'teal', message: t('admin.session.logoutSuccess') });
    },
    onError: () => {
      notifications.show({ color: 'red', message: t('admin.session.logoutFailed') });
    },
  });
}
