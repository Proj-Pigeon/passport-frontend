import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listExternalIdentities,
  listFederationProviders,
  type LinkedIdentity,
} from '@/api/endpoints/federation';

export type { FederationProvider } from '@/api/endpoints/federation';
export type { LinkedIdentity } from '@/api/endpoints/federation';

export function useFederationProviders() {
  return useQuery({
    queryKey: ['federation', 'providers'],
    queryFn: ({ signal }) => listFederationProviders(signal),
    staleTime: 60_000,
  });
}

export function useExternalIdentities() {
  return useQuery({
    queryKey: ['federation', 'external-identities'],
    queryFn: ({ signal }) => listExternalIdentities(signal),
  });
}

export function useInvalidateExternalIdentities() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['federation', 'external-identities'] });
}

export function linkedIdentitiesByProvider(identities: LinkedIdentity[] | undefined) {
  const grouped = new Map<string, LinkedIdentity[]>();
  for (const identity of identities ?? []) {
    const rows = grouped.get(identity.provider_slug) ?? [];
    rows.push(identity);
    grouped.set(identity.provider_slug, rows);
  }
  return grouped;
}
