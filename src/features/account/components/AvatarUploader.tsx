import { Alert, Button, FileButton, Group, Stack, Text } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { IconUpload } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldErrorI18nKey, isApiError } from '@/api/errors';
import { AccountAvatar } from '@/components/AccountAvatar';
import { useDeleteAvatar, useUploadAvatar } from '@/features/account/useAvatar';
import { useAvatarUrl } from '@/features/account/useProfile';
import { describeApiError } from '@/i18n/errors';
import { prepareAvatarFile } from '@/lib/image';

export function AvatarUploader() {
  const { t } = useTranslation();
  const modals = useModals();
  const avatarUrl = useAvatarUrl();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const fileResetRef = useRef<() => void>(() => {});
  const mountedRef = useRef(false);
  const preparingRef = useRef(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const isUploading = isPreparing || upload.isPending;
  const isBusy = isUploading || remove.isPending;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleFile = async (file: File | null) => {
    fileResetRef.current();
    if (
      !file ||
      !mountedRef.current ||
      preparingRef.current ||
      upload.isPending ||
      remove.isPending
    ) {
      return;
    }

    preparingRef.current = true;
    setIsPreparing(true);
    setIssue(null);
    try {
      const result = await prepareAvatarFile(file);
      if (!mountedRef.current) {
        return;
      }
      if (!result.ok) {
        setIssue(t(fieldErrorI18nKey('avatar', result.issue)));
        return;
      }

      upload.mutate(
        { blob: result.avatar.blob, mediaType: result.avatar.mediaType },
        {
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
    } finally {
      preparingRef.current = false;
      if (mountedRef.current) {
        setIsPreparing(false);
      }
    }
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
        <AccountAvatar size={88} radius="xl" />

        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          {avatarUrl && (
            <Text size="xs" c="dimmed">
              {t('account.avatar.current')}
            </Text>
          )}

          <Group gap="xs">
            <FileButton
              resetRef={fileResetRef}
              onChange={handleFile}
              accept="image/png,image/jpeg"
              disabled={isBusy}
              inputProps={{ disabled: isBusy }}
            >
              {(props) => (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconUpload size={16} />}
                  loading={isUploading}
                  disabled={isBusy}
                  {...props}
                >
                  {t('common.uploadImage')}
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
                disabled={isUploading}
              >
                {t('common.delete')}
              </Button>
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
