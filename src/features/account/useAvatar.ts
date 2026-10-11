import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { deleteAvatar, uploadAvatar } from '@/api/endpoints/me';
import type { AvatarMediaType } from '@/lib/image';
import { queryKeys } from '@/features/session/keys';

import { bumpAvatarVersion } from './avatarVersion';

export interface AvatarUploadInput {
  blob: Blob;
  mediaType: AvatarMediaType;
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ blob, mediaType }: AvatarUploadInput) => uploadAvatar(blob, mediaType),
    onSuccess: () => {
      bumpAvatarVersion();
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      notifications.show({ color: 'teal', message: t('account.avatar.uploadSuccess') });
    },
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => deleteAvatar(),
    onSuccess: () => {
      bumpAvatarVersion();
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      notifications.show({ color: 'teal', message: t('account.avatar.deleteSuccess') });
    },
    onError: () => {
      notifications.show({ color: 'red', message: t('account.avatar.deleteFailed') });
    },
  });
}
