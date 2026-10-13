import { Navigate, useLocation, useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { samlRequestFromSearch } from '@/lib/loginReturn';
import { locationToNext, nextFromSearchParams, withNextParam } from '@/lib/safeNext';

import { useSession } from './useSession';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error, refetch } = useSession();
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
    return <Navigate to={next ? withNextParam('/login', next) : '/login'} replace />;
  }

  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [searchParams] = useSearchParams();

  if (status === 'loading') {
    return <PageState kind="loading" minHeight="60vh" />;
  }

  if (status === 'authenticated' && !samlRequestFromSearch(searchParams.toString())) {
    const next = nextFromSearchParams(searchParams.toString());
    return <Navigate to={next ?? '/account'} replace />;
  }

  return children;
}
