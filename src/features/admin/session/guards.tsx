import type { ReactNode } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { locationToNext, nextFromSearchParams, withNextParam } from '@/lib/safeNext';

import { useAdminSession } from './useAdminSession';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, error, refetch } = useAdminSession();
  const location = useLocation();
  const { t } = useTranslation();

  if (status === 'loading') {
    return <PageState kind="loading" minHeight="60vh" />;
  }

  if (status === 'error') {
    return (
      <PageState
        kind="error"
        minHeight="60vh"
        title={t('errors.title')}
        description={describeApiError(error)}
        error={error}
        onRetry={refetch}
      />
    );
  }

  if (status === 'anonymous') {
    const next = locationToNext(location);
    return <Navigate to={next ? withNextParam('/admin/login', next) : '/admin/login'} replace />;
  }

  return children;
}

export function AdminGuestOnly({ children }: { children: ReactNode }) {
  const { status, error, refetch } = useAdminSession();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  if (status === 'loading') {
    return <PageState kind="loading" minHeight="60vh" />;
  }

  if (status === 'error') {
    return (
      <PageState
        kind="error"
        minHeight="60vh"
        title={t('errors.title')}
        description={describeApiError(error)}
        error={error}
        onRetry={refetch}
      />
    );
  }

  if (status === 'authenticated') {
    const next = nextFromSearchParams(searchParams.toString());
    return <Navigate to={next ?? '/admin'} replace />;
  }

  return children;
}
