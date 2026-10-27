import { useQuery } from '@tanstack/react-query';

import { getAdminOverview } from '@/api/endpoints/admin/session';

import { adminKeys } from '../keys';

export const ADMIN_OVERVIEW_STALE_TIME_MS = 60_000;

export function useAdminOverview(enabled: boolean) {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: ({ signal }) => getAdminOverview(signal),
    enabled,
    staleTime: ADMIN_OVERVIEW_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}
