import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getProfile, updateDisplayName, updateStepUpPreference } from '@/api/endpoints/me';
import { isUnauthorized } from '@/api/errors';
import { resolveAssetUrl } from '@/api/http';
import type { Profile } from '@/api/types';
import { queryKeys } from '@/features/session/keys';

import { useAvatarVersion } from './avatarVersion';

export interface UseProfileResult {
  profile: Profile | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useProfile(): UseProfileResult {
  const query = useQuery({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => getProfile(signal),
    retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 1,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: () => query.refetch(),
  };
}

export function useDisplayName(): string {
  const { profile } = useProfile();
  return useMemo(() => profile?.display_name?.trim() || profile?.username || '', [profile]);
}

export function useUpdateStepUpPreference() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (stepUpRequired: boolean) => updateStepUpPreference(stepUpRequired),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
    onError: () => {
      notifications.show({ color: 'red', message: t('account.security.stepUpSaveFailed') });
    },
  });
}

export function useAvatarUrl(): string | null {
  const { profile } = useProfile();
  const version = useAvatarVersion();
  return useMemo(() => {
    const base = resolveAssetUrl(profile?.avatar_url);
    if (!base) {
      return null;
    }
    return version > 0 ? `${base}${base.includes('?') ? '&' : '?'}v=${version}` : base;
  }, [profile?.avatar_url, version]);
}

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (displayName: string) => updateDisplayName(displayName),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.session });
      notifications.show({ color: 'teal', message: t('account.profile.saveSuccess') });
    },
    onError: () => {
      notifications.show({ color: 'red', message: t('account.profile.saveFailed') });
    },
  });
}
