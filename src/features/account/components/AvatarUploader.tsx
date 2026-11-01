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
import { readImageForCrop, type CropImageSource } from '@/lib/image';

import { AvatarCropModal, type AvatarCropResult } from './AvatarCropModal';

export function AvatarUploader() {
  const { t } = useTranslation();
  const modals = useModals();
  const avatarUrl = useAvatarUrl();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const fileResetRef = useRef<() => void>(() => {});
  const mountedRef = useRef(false);
  const preparingRef = useRef(false);
  const sourceRef = useRef<CropImageSource | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [source, setSource] = useState<CropImageSource | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const isUploading = isPreparing || upload.isPending;
  const isBusy = isUploading || remove.isPending || source !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sourceRef.current) {
        URL.revokeObjectURL(sourceRef.current.url);
      }
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
      const result = await readImageForCrop(file);
      if (!mountedRef.current) {
        if (result.ok) {
          URL.revokeObjectURL(result.source.url);
        }
        return;
      }
      if (!result.ok) {
        setIssue(t(fieldErrorI18nKey('avatar', result.issue)));
        return;
      }
      if (sourceRef.current) {
        URL.revokeObjectURL(sourceRef.current.url);
      }
      sourceRef.current = result.source;
      setSource(result.source);
    } finally {
      preparingRef.current = false;
      if (mountedRef.current) {
        setIsPreparing(false);
      }
    }
  };

  const closeCrop = () => {
    setSource(null);
  };

  const handleCropConfirm = ({ blob, mediaType }: AvatarCropResult) => {
    closeCrop();
    upload.mutate(
      { blob, mediaType },
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
        <AccountAvatar size={88} />

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

      <AvatarCropModal source={source} onCancel={closeCrop} onConfirm={handleCropConfirm} />
    </Stack>
  );
}
