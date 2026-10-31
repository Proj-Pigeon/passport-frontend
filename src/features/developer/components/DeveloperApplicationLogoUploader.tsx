import {
  Alert,
  Button,
  FileButton,
  Group,
  Image,
  Modal,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconPhoto, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  deleteDeveloperApplicationLogo,
  getDeveloperApplicationLogo,
  uploadDeveloperApplicationLogo,
} from '@/api/endpoints/developer/resources';
import { abortedError, fieldErrorI18nKey, isApiError } from '@/api/errors';
import { apiUrl } from '@/api/http';
import { useStepUp } from '@/features/step-up/useStepUp';
import { describeApiError } from '@/i18n/errors';
import { prepareAvatarFile, type PreparedAvatar } from '@/lib/image';

import { developerPanelKeys } from '../keys';

export function DeveloperApplicationLogoUploader({
  applicationId,
  displayName,
  canWrite,
}: {
  applicationId: string;
  displayName: string;
  canWrite?: boolean;
}) {
  const { t } = useTranslation();
  const stepUp = useStepUp();
  const queryClient = useQueryClient();
  const fileResetRef = useRef<() => void>(() => {});
  const mountedRef = useRef(false);
  const canWriteRef = useRef(canWrite);
  const busyRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [removeOpened, setRemoveOpened] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    canWriteRef.current = canWrite;
  }, [canWrite]);

  const logoQuery = useQuery({
    queryKey: developerPanelKeys.applicationLogo(applicationId),
    queryFn: ({ signal }) => getDeveloperApplicationLogo(applicationId, signal),
  });
  const logoUrl = logoQuery.data
    ? `${apiUrl(`/v1/developer/applications/${encodeURIComponent(applicationId)}/logo`)}?v=${logoQuery.dataUpdatedAt}`
    : null;

  const mutation = useMutation({
    mutationFn: (avatar: PreparedAvatar | null) =>
      stepUp.runWithStepUp(
        () => {
          if (!mountedRef.current || !canWriteRef.current) throw abortedError();
          return avatar
            ? uploadDeveloperApplicationLogo(applicationId, avatar.blob, avatar.mediaType)
            : deleteDeveloperApplicationLogo(applicationId);
        },
        { requireVerification: true },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: developerPanelKeys.applicationLogo(applicationId),
      });
      if (mountedRef.current) setIssue(null);
    },
    onError: (error) => {
      if (!mountedRef.current) return;
      const code = isApiError(error)
        ? (error.fieldCode('logo') ?? error.fieldCode('avatar'))
        : undefined;
      setIssue(
        code
          ? t(fieldErrorI18nKey('avatar', code), { defaultValue: describeApiError(error) })
          : describeApiError(error),
      );
    },
    onSettled: () => {
      busyRef.current = false;
    },
  });

  const handleFile = async (file: File | null) => {
    fileResetRef.current();
    if (!file || !canWrite || !mountedRef.current || busyRef.current || removeOpened) return;
    busyRef.current = true;
    setIssue(null);
    setPreparing(true);
    let uploading = false;
    try {
      const result = await prepareAvatarFile(file);
      if (!mountedRef.current || !canWriteRef.current) return;
      if (!result.ok) {
        setIssue(t(fieldErrorI18nKey('avatar', result.issue)));
        return;
      }
      mutation.mutate(result.avatar);
      uploading = true;
    } catch {
      if (mountedRef.current) setIssue(t('errors.field.avatar.read_failed'));
    } finally {
      if (!uploading) busyRef.current = false;
      if (mountedRef.current) setPreparing(false);
    }
  };

  const removeLogo = () => {
    if (!canWrite || !mountedRef.current || busyRef.current || !removeOpened) return;
    busyRef.current = true;
    setIssue(null);
    setRemoveOpened(false);
    mutation.mutate(null);
  };
  const busy = preparing || mutation.isPending;

  return (
    <Stack gap="md">
      <Group align="flex-start" gap="md" wrap="nowrap">
        {logoUrl ? (
          <Image src={logoUrl} alt={displayName} w={88} h={88} radius="md" fit="contain" />
        ) : (
          <ThemeIcon size={88} radius="md" variant="light" color="gray">
            <IconPhoto size={32} stroke={1.5} />
          </ThemeIcon>
        )}
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500}>
            {t('admin.branding.logo')}
          </Text>
          <Text size="xs" c="dimmed">
            {t('admin.branding.logoHint')}
          </Text>
          {canWrite && (
            <Group gap="xs">
              <FileButton
                resetRef={fileResetRef}
                onChange={handleFile}
                accept="image/png,image/jpeg"
                disabled={busy || removeOpened}
                inputProps={{ disabled: busy || removeOpened }}
              >
                {(props) => (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconUpload size={16} />}
                    loading={preparing || (mutation.isPending && mutation.variables !== null)}
                    disabled={busy || removeOpened}
                    {...props}
                  >
                    {t('common.uploadImage')}
                  </Button>
                )}
              </FileButton>
              {logoUrl && (
                <Button
                  size="xs"
                  color="red"
                  variant="subtle"
                  loading={mutation.isPending && mutation.variables === null}
                  disabled={busy || removeOpened}
                  onClick={() => {
                    if (!busyRef.current) setRemoveOpened(true);
                  }}
                >
                  {t('admin.branding.logoRemove')}
                </Button>
              )}
            </Group>
          )}
        </Stack>
      </Group>
      {issue && (
        <Alert color="red" variant="light" role="alert">
          <Text size="sm">{issue}</Text>
        </Alert>
      )}
      <Modal
        opened={removeOpened && !!canWrite}
        onClose={() => setRemoveOpened(false)}
        title={t('admin.branding.logoRemove')}
      >
        <Stack gap="md">
          <Text size="sm">{displayName}</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setRemoveOpened(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={removeLogo} disabled={!canWrite || busy}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
