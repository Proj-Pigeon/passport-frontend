import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { importResourceMetadata } from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';

import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { ReasonModal } from '../ReasonModal';
import type { ResourceSectionProps } from './resourceTypes';

export function MetadataImportCard({
  kind,
  resource,
  etag,
  refresh,
  canWrite = true,
}: ResourceSectionProps & { kind: 'saml' | 'federation' }) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const [metadata, setMetadata] = useState('');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [modal, setModal] = useState<'paste' | 'discovery' | null>(null);

  const format: 'saml' | 'oidc' =
    kind === 'saml' ? 'saml' : resource.configuration['provider_type'] === 'saml' ? 'saml' : 'oidc';
  const supportsDiscovery = kind === 'federation' && format === 'oidc';

  const mutation = useMutation({
    mutationFn: () =>
      stepUp.runWithAdminStepUp(() =>
        importResourceMetadata(
          kind,
          resource.id,
          {
            metadata: modal === 'discovery' ? '' : metadata,
            discovery_url: modal === 'discovery' ? discoveryUrl.trim() : undefined,
            format,
          },
          etag,
        ),
      ),
    onSuccess: async () => {
      setModal(null);
      setMetadata('');
      setDiscoveryUrl('');
      await refresh();
    },
  });

  const closeModal = () => {
    setModal(null);
    mutation.reset();
  };

  return (
    <>
      <SectionCard
        title={t('admin.metadata.title')}
        description={t('admin.metadata.hint', {
          format: format === 'saml' ? 'SAML XML' : 'OIDC discovery JSON',
        })}
        action={
          canWrite ? (
            <Group gap="xs">
              {supportsDiscovery && (
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => {
                    mutation.reset();
                    setModal('discovery');
                  }}
                >
                  {t('admin.metadata.fetchDiscovery')}
                </Button>
              )}
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  mutation.reset();
                  setModal('paste');
                }}
              >
                {t('admin.metadata.submit')}
              </Button>
            </Group>
          ) : undefined
        }
      >
        <Stack gap="xs">
          {mutation.isSuccess && (
            <Alert color="green" variant="light">
              {t('admin.metadata.imported')}
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            {t('admin.metadata.trustReview')}
          </Text>
        </Stack>
      </SectionCard>

      <ReasonModal
        opened={modal !== null}
        onClose={() => (mutation.isPending ? undefined : closeModal())}
        title={
          modal === 'discovery' ? t('admin.metadata.fetchDiscovery') : t('admin.metadata.submit')
        }
        description={t('admin.metadata.confirm')}
        confirmLabel={t('admin.metadata.submit')}
        confirmDisabled={
          modal === 'discovery' ? discoveryUrl.trim().length === 0 : metadata.trim().length === 0
        }
        pending={mutation.isPending}
        error={mutation.error}
        size="lg"
        extraFields={
          modal === 'discovery' ? (
            <TextInput
              label={t('admin.metadata.discoveryUrl')}
              description={t('admin.metadata.discoveryUrlHint')}
              placeholder="https://accounts.google.com"
              value={discoveryUrl}
              onChange={(event) => setDiscoveryUrl(event.currentTarget.value)}
              data-autofocus
              required
            />
          ) : (
            <Textarea
              label={t('admin.metadata.title')}
              value={metadata}
              onChange={(event) => setMetadata(event.currentTarget.value)}
              placeholder={
                format === 'saml' ? '<EntityDescriptor …>' : '{"issuer": "https://idp.example", …}'
              }
              autosize
              minRows={6}
              maxRows={14}
              ff="monospace"
              data-autofocus
              required
            />
          )
        }
        onSubmit={() => mutation.mutate()}
      />
    </>
  );
}
