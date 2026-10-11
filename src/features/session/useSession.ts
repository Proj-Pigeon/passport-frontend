import { useQuery } from '@tanstack/react-query';

import { getCurrentSession } from '@/api/endpoints/session';
import { isUnauthorized } from '@/api/errors';
import type { CurrentSessionResponse, SessionInfo, SessionUser } from '@/api/types';

import { queryKeys } from './keys';

export const SESSION_STALE_TIME_MS = 30_000;

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface UseSessionResult {
  status: SessionStatus;
  data: CurrentSessionResponse | null;
  session: SessionInfo | null;
  user: SessionUser | null;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useSession(): UseSessionResult {
  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => getCurrentSession(signal),
    staleTime: SESSION_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 1,
  });

  const status: SessionStatus = query.data
    ? 'authenticated'
    : query.isPending
      ? 'loading'
      : isUnauthorized(query.error)
        ? 'anonymous'
        : 'error';

  return {
    status,
    data: query.data ?? null,
    session: query.data?.session ?? null,
    user: query.data?.user ?? null,
    isAuthenticated: status === 'authenticated',
    isAnonymous: status === 'anonymous',
    isLoading: status === 'loading',
    error: query.error,
    refetch: () => query.refetch(),
  };
}
