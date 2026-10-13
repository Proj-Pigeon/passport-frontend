import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import { CURRENT_SESSION_PATH } from '@/api/endpoints/session';
import { ADMIN_SESSION_PATH } from '@/api/endpoints/admin/session';
import { setUnauthorizedHandler } from '@/api/unauthorized';
import { ADMIN_QUERY_ROOT } from '@/features/admin/keys';
import { queryKeys } from '@/features/session/keys';
import { locationToNext, withNextParam } from '@/lib/safeNext';

const GUEST_PATH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

function isGuestPath(pathname: string): boolean {
  return GUEST_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function UnauthorizedWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    setUnauthorizedHandler((event) => {
      if (event.scope === 'admin') {
        if (event.path === ADMIN_SESSION_PATH) {
          return;
        }

        resetCsrfToken('admin');
        queryClient.removeQueries({ queryKey: ADMIN_QUERY_ROOT });

        if (!isAdminPath(location.pathname) || location.pathname === '/admin/login') {
          return;
        }

        notifications.show({ color: 'yellow', message: t('admin.session.expired') });
        const next = locationToNext(location);
        navigate(next ? withNextParam('/admin/login', next) : '/admin/login', { replace: true });
        return;
      }

      if (event.path === CURRENT_SESSION_PATH) {
        return;
      }

      resetCsrfToken('account');
      queryClient.clear();

      if (isGuestPath(location.pathname)) {
        return;
      }

      if (isAdminPath(location.pathname)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.session });
        return;
      }

      notifications.show({ color: 'yellow', message: t('session.expired') });
      const next = locationToNext(location);
      navigate(next ? withNextParam('/login', next) : '/login', { replace: true });
    });

    return () => setUnauthorizedHandler(null);
  }, [navigate, location, queryClient, t]);

  return null;
}
