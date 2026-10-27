import {
  Alert,
  Anchor,
  Avatar,
  Button,
  FileButton,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldErrorI18nKey } from '@/api/errors';
import { apiUrl } from '@/api/http';
import {
  deleteApplicationLogo,
  getApplicationLogo,
  patchAdminResource,
  uploadApplicationLogo,
} from '@/api/endpoints/admin/resources';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';
import { prepareAvatarFile } from '@/lib/image';

import { adminKeys } from '../../keys';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { ReasonModal } from '../ReasonModal';
import type { ResourceSectionProps } from './resourceTypes';

function configString(configuration: Record<string, unknown>, key: string): string {
  const value = configuration[key];
  return typeof value === 'string' ? value : '';
}

function validDeveloperUrl(value: string): boolean {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '';
  } catch {
    return false;
  }
}

export function ApplicationBrandingCard({
  resource,
  etag,
  refresh,
  canWrite,
}: ResourceSectionProps) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const queryClient = useQueryClient();
  const fileResetRef = useRef<() => void>(() => {});
  const [logoIssue, setLogoIssue] = useState<string | null>(null);

  const logoQuery = useQuery({
    queryKey: adminKeys.applicationLogo(resource.id),
    queryFn: ({ signal }) => getApplicationLogo(resource.id, signal),
  });
  const logoUrl = logoQuery.data
    ? `${apiUrl(`/admin/v1/applications/${encodeURIComponent(resource.id)}/logo`)}?v=${logoQuery.dataUpdatedAt}`
    : null;

  const currentDeveloperName = configString(resource.configuration, 'developer_name');
  const currentDeveloperUrl = configString(resource.configuration, 'developer_url');
  const [developerName, setDeveloperName] = useState(currentDeveloperName);
  const [developerUrl, setDeveloperUrl] = useState(currentDeveloperUrl);
  const [urlError, setUrlError] = useState(false);
  const [saveModal, setSaveModal] = useState(false);

  const invalidateLogo = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.applicationLogo(resource.id) });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      stepUp.runWithAdminStepUp(() => uploadApplicationLogo(resource.id, file, file.type)),
    onSuccess: async () => {
      setLogoIssue(null);
      await invalidateLogo();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => stepUp.runWithAdminStepUp(() => deleteApplicationLogo(resource.id)),
    onSuccess: async () => {
      setLogoIssue(null);
      await invalidateLogo();
    },
  });
  const saveMutation = useMutation({
    mutationFn: (reason: string) =>
      stepUp.runWithAdminStepUp(() =>
        patchAdminResource(
          'application',
          resource.id,
          {
            reason,
            configuration: {
              display_name: resource.display_name,
              developer_name: developerName.trim(),
              developer_url: developerUrl.trim(),
            },
          },
          etag,
        ),
      ),
    onSuccess: async () => {
      setSaveModal(false);
      await refresh();
    },
  });

  const handleFile = async (file: File | null) => {
    fileResetRef.current();
    if (!file) return;
    uploadMutation.reset();
    setLogoIssue(null);
    const prepared = await prepareAvatarFile(file);
    if (!prepared.ok) {
      setLogoIssue(t(fieldErrorI18nKey('avatar', prepared.issue)));
      return;
    }
    uploadMutation.mutate(
      new File([prepared.avatar.blob], file.name, { type: prepared.avatar.mediaType }),
    );
  };

  const dirty =
    developerName.trim() !== currentDeveloperName || developerUrl.trim() !== currentDeveloperUrl;

  const openEditModal = () => {
    setDeveloperName(currentDeveloperName);
    setDeveloperUrl(currentDeveloperUrl);
    setUrlError(false);
    saveMutation.reset();
    setSaveModal(true);
  };

  return (
    <SectionCard
      title={t('admin.branding.card')}
      description={t('admin.branding.hint')}
      action={
        canWrite ? (
          <Button size="xs" variant="light" onClick={openEditModal}>
            {t('admin.branding.save')}
          </Button>
        ) : undefined
      }
    >
      <Stack gap="md">
        <Group align="center" gap="md" wrap="nowrap">
          {logoUrl ? (
            <Avatar src={logoUrl} alt={resource.display_name} size={64} radius="md" />
          ) : (
            <ThemeIcon size={64} radius="md" variant="light" color="gray">
              <IconPhoto size={28} stroke={1.5} />
            </ThemeIcon>
          )}
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={500}>
              {t('admin.branding.logo')}
            </Text>
            <Text size="xs" c="dimmed">
              {t('admin.branding.logoHint')}
            </Text>
            {canWrite && (
              <Group gap="xs" mt={4}>
                <FileButton
                  resetRef={fileResetRef}
                  onChange={handleFile}
                  accept="image/png,image/jpeg"
                  disabled={uploadMutation.isPending}
                >
                  {(props) => (
                    <Button size="xs" variant="light" loading={uploadMutation.isPending} {...props}>
                      {logoUrl ? t('admin.branding.logoReplace') : t('admin.branding.logoUpload')}
                    </Button>
                  )}
                </FileButton>
                {logoUrl && (
                  <Button
                    size="xs"
                    color="red"
                    variant="subtle"
                    loading={deleteMutation.isPending}
                    onClick={() => {
                      deleteMutation.reset();
                      deleteMutation.mutate();
                    }}
                  >
                    {t('admin.branding.logoRemove')}
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        </Group>

        {logoIssue !== null && (
          <Alert color="red" variant="light" role="alert">
            <Text size="sm">{logoIssue}</Text>
          </Alert>
        )}
        {uploadMutation.error !== null && (
          <Alert color="red" variant="light" role="alert">
            <Text size="sm">{describeApiError(uploadMutation.error)}</Text>
          </Alert>
        )}
        {deleteMutation.error !== null && (
          <Alert color="red" variant="light" role="alert">
            <Text size="sm">{describeApiError(deleteMutation.error)}</Text>
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <InfoItem label={t('admin.branding.developerName')}>
            <Text size="sm">{currentDeveloperName || '—'}</Text>
          </InfoItem>
          <InfoItem label={t('admin.branding.developerUrl')}>
            {currentDeveloperUrl ? (
              <Anchor
                href={currentDeveloperUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                style={{ wordBreak: 'break-all' }}
              >
                {currentDeveloperUrl}
              </Anchor>
            ) : (
              <Text size="sm">—</Text>
            )}
          </InfoItem>
        </SimpleGrid>
      </Stack>

      <ReasonModal
        opened={saveModal}
        onClose={() => (saveMutation.isPending ? undefined : setSaveModal(false))}
        title={t('admin.branding.save')}
        confirmLabel={t('common.submit')}
        confirmDisabled={!dirty || urlError}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        extraFields={
          <Stack gap="sm">
            <TextInput
              label={t('admin.branding.developerName')}
              value={developerName}
              onChange={(event) => setDeveloperName(event.currentTarget.value)}
              maxLength={160}
              data-autofocus
            />
            <TextInput
              label={t('admin.branding.developerUrl')}
              value={developerUrl}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setDeveloperUrl(next);
                setUrlError(!validDeveloperUrl(next.trim()));
              }}
              placeholder="https://developer.example.com"
              maxLength={2048}
              error={urlError ? t('admin.branding.invalidUrl') : undefined}
            />
          </Stack>
        }
        onSubmit={(reason) => {
          if (!validDeveloperUrl(developerUrl.trim())) {
            setUrlError(true);
            return;
          }
          saveMutation.mutate(reason);
        }}
      />
    </SectionCard>
  );
}
