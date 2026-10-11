import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import { CURRENT_SESSION_PATH } from '@/api/endpoints/session';
import { setUnauthorizedHandler } from '@/api/unauthorized';
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

export function UnauthorizedWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  useEffect(() => {
    setUnauthorizedHandler((event) => {
      if (event.path === CURRENT_SESSION_PATH) {
        return;
      }

      resetCsrfToken();
      queryClient.clear();

      if (isGuestPath(location.pathname)) {
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
