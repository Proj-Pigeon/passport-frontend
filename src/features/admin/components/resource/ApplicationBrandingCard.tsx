import { Alert, Button, FileInput, Group, Image, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { apiUrl } from '@/api/http';
import {
  deleteApplicationLogo,
  getApplicationLogo,
  patchAdminResource,
  uploadApplicationLogo,
} from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';

import { adminKeys } from '../../keys';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import type { ResourceSectionProps } from '../../pages/AdminResourceDetailPage';
import { ReasonModal } from '../ReasonModal';

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
  const logoQuery = useQuery({
    queryKey: adminKeys.applicationLogo(resource.id),
    queryFn: ({ signal }) => getApplicationLogo(resource.id, signal),
  });
  const logoUrl =
    logoQuery.data !== null
      ? `${apiUrl(`/admin/v1/applications/${encodeURIComponent(resource.id)}/logo`)}?v=${logoQuery.dataUpdatedAt}`
      : null;

  const [developerName, setDeveloperName] = useState(() =>
    configString(resource.configuration, 'developer_name'),
  );
  const [developerUrl, setDeveloperUrl] = useState(() =>
    configString(resource.configuration, 'developer_url'),
  );
  const [urlError, setUrlError] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saveModal, setSaveModal] = useState(false);

  const invalidateLogo = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.applicationLogo(resource.id) });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      stepUp.runWithAdminStepUp(() => uploadApplicationLogo(resource.id, file, file.type)),
    onSuccess: async () => {
      setLogoFile(null);
      await invalidateLogo();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => stepUp.runWithAdminStepUp(() => deleteApplicationLogo(resource.id)),
    onSuccess: async () => {
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

  const dirty =
    developerName.trim() !== configString(resource.configuration, 'developer_name') ||
    developerUrl.trim() !== configString(resource.configuration, 'developer_url');

  return (
    <SectionCard title={t('admin.branding.card')} description={t('admin.branding.hint')}>
      <Stack gap="sm">
        <Group align="flex-start" gap="md" wrap="wrap">
          {logoUrl ? (
            <Image src={logoUrl} width={72} height={72} radius="md" alt={resource.display_name} />
          ) : (
            <Text size="sm" c="dimmed">
              {t('admin.branding.logoMissing')}
            </Text>
          )}
          {canWrite && (
            <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
              <FileInput
                label={t('admin.branding.logo')}
                description={t('admin.branding.logoHint')}
                accept="image/png,image/jpeg"
                value={logoFile}
                onChange={setLogoFile}
                clearable
              />
              <Group gap="sm">
                <Button
                  size="xs"
                  variant="light"
                  disabled={!logoFile || uploadMutation.isPending}
                  loading={uploadMutation.isPending}
                  onClick={() => {
                    uploadMutation.reset();
                    if (logoFile) uploadMutation.mutate(logoFile);
                  }}
                >
                  {logoUrl ? t('admin.branding.logoReplace') : t('admin.branding.logoUpload')}
                </Button>
                {logoUrl && (
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
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
            </Stack>
          )}
        </Group>

        <TextInput
          label={t('admin.branding.developerName')}
          value={developerName}
          onChange={(event) => setDeveloperName(event.currentTarget.value)}
          maxLength={160}
          disabled={!canWrite}
        />
        <TextInput
          label={t('admin.branding.developerUrl')}
          value={developerUrl}
          onChange={(event) => {
            setDeveloperUrl(event.currentTarget.value);
            setUrlError(false);
          }}
          placeholder="https://developer.example.com"
          maxLength={2048}
          disabled={!canWrite}
          error={urlError ? t('admin.branding.invalidUrl') : undefined}
        />
        {canWrite && (
          <Group gap="sm">
            <Button
              size="xs"
              variant="light"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => {
                saveMutation.reset();
                if (!validDeveloperUrl(developerUrl.trim())) {
                  setUrlError(true);
                  return;
                }
                setSaveModal(true);
              }}
            >
              {t('admin.branding.save')}
            </Button>
          </Group>
        )}
      </Stack>

      <ReasonModal
        opened={saveModal}
        onClose={() => (saveMutation.isPending ? undefined : setSaveModal(false))}
        title={t('admin.branding.save')}
        confirmLabel={t('common.submit')}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        onSubmit={(reason) => saveMutation.mutate(reason)}
      />
    </SectionCard>
  );
}
