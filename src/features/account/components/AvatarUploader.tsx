import { Alert, Avatar, Button, FileButton, Group, Stack, Text } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldErrorI18nKey, isApiError } from '@/api/errors';
import { AccountAvatar } from '@/components/AccountAvatar';
import { useDeleteAvatar, useUploadAvatar } from '@/features/account/useAvatar';
import { useAvatarUrl } from '@/features/account/useProfile';
import { describeApiError } from '@/i18n/errors';
import { formatBytes } from '@/lib/format';
import { prepareAvatarFile, type PreparedAvatar } from '@/lib/image';

interface PendingAvatar extends PreparedAvatar {
  previewUrl: string;
  fileName: string;
}

export function AvatarUploader() {
  const { t } = useTranslation();
  const modals = useModals();
  const avatarUrl = useAvatarUrl();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const fileResetRef = useRef<() => void>(() => {});

  const [pending, setPending] = useState<PendingAvatar | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const pendingRef = useRef<PendingAvatar | null>(null);

  const clearPending = useCallback(() => {
    if (pendingRef.current) {
      URL.revokeObjectURL(pendingRef.current.previewUrl);
    }
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(
    () => () => {
      if (pendingRef.current) {
        URL.revokeObjectURL(pendingRef.current.previewUrl);
      }
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File | null) => {
      fileResetRef.current();
      setIssue(null);
      clearPending();
      if (!file) {
        return;
      }

      const result = await prepareAvatarFile(file);
      if (!result.ok) {
        setIssue(t(fieldErrorI18nKey('avatar', result.issue)));
        return;
      }

      const next: PendingAvatar = {
        ...result.avatar,
        previewUrl: URL.createObjectURL(result.avatar.blob),
        fileName: file.name,
      };
      pendingRef.current = next;
      setPending(next);
    },
    [clearPending, t],
  );

  const handleUpload = () => {
    if (!pending) {
      return;
    }
    setIssue(null);
    upload.mutate(
      { blob: pending.blob, mediaType: pending.mediaType },
      {
        onSuccess: clearPending,
        onError: (error) => {
          const code = isApiError(error) ? error.fieldCode('avatar') : undefined;
          setIssue(
            code
              ? t(fieldErrorI18nKey('avatar', code), { defaultValue: describeApiError(error) })
              : describeApiError(error),
          );
        },
      },
    );
  };

  const confirmDelete = () => {
    modals.openConfirmModal({
      title: t('account.avatar.deleteTitle'),
      children: <Text size="sm">{t('account.avatar.deleteBody')}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(),
    });
  };

  return (
    <Stack gap="md">
      <Group gap="lg" align="flex-start" wrap="nowrap">
        {pending ? (
          <Avatar src={pending.previewUrl} size={88} radius="xl" alt={pending.fileName} />
        ) : (
          <AccountAvatar size={88} radius="xl" />
        )}

        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" c="dimmed">
            {t('account.avatar.hint')}
          </Text>

          {pending ? (
            <Stack gap={4}>
              <Text size="sm" lineClamp={1}>
                {pending.fileName}
              </Text>
              <Text size="xs" c="dimmed">
                {t('account.avatar.fileMeta', {
                  size: formatBytes(pending.size),
                  dimensions: `${pending.width} × ${pending.height}`,
                  type: pending.mediaType === 'image/png' ? 'PNG' : 'JPEG',
                })}
              </Text>
            </Stack>
          ) : (
            avatarUrl && (
              <Text size="xs" c="dimmed">
                {t('account.avatar.current')}
              </Text>
            )
          )}

          <Group gap="xs">
            {pending ? (
              <>
                <Button size="xs" onClick={handleUpload} loading={upload.isPending}>
                  {t('account.avatar.upload')}
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={clearPending}
                  disabled={upload.isPending}
                >
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <>
                <FileButton
                  resetRef={fileResetRef}
                  onChange={handleFile}
                  accept="image/png,image/jpeg"
                  disabled={upload.isPending}
                >
                  {(props) => (
                    <Button size="xs" variant="light" {...props}>
                      {t('account.avatar.choose')}
                    </Button>
                  )}
                </FileButton>
                {avatarUrl && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={confirmDelete}
                    loading={remove.isPending}
                  >
                    {t('common.delete')}
                  </Button>
                )}
              </>
            )}
          </Group>
        </Stack>
      </Group>

      {issue && (
        <Alert
          color="red"
          variant="light"
          role="alert"
          onClose={() => setIssue(null)}
          withCloseButton
        >
          <Text size="sm">{issue}</Text>
        </Alert>
      )}
    </Stack>
  );
}
