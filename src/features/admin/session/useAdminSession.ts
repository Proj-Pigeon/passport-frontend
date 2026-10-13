import { useQuery } from '@tanstack/react-query';

import type { AdminCapability, AdminSessionInfo } from '@/api/endpoints/admin/types';
import { getCurrentAdminSession } from '@/api/endpoints/admin/session';
import { isUnauthorized } from '@/api/errors';

import { adminKeys } from '../keys';

export const ADMIN_SESSION_STALE_TIME_MS = 30_000;

export type AdminSessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface UseAdminSessionResult {
  status: AdminSessionStatus;
  data: AdminSessionInfo | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useAdminSession(): UseAdminSessionResult {
  const query = useQuery({
    queryKey: adminKeys.session,
    queryFn: ({ signal }) => getCurrentAdminSession(signal),
    staleTime: ADMIN_SESSION_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 1,
  });

  const status: AdminSessionStatus = query.data
    ? 'authenticated'
    : query.isPending
      ? 'loading'
      : isUnauthorized(query.error)
        ? 'anonymous'
        : 'error';

  return {
    status,
    data: query.data ?? null,
    isLoading: status === 'loading',
    error: query.error,
    refetch: () => query.refetch(),
  };
}

export function hasAdminCapability(
  session: AdminSessionInfo | null | undefined,
  capability: AdminCapability,
): boolean {
  return session?.capabilities.includes(capability) ?? false;
}
