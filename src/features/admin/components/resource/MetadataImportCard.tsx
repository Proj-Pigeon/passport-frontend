import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { importResourceMetadata } from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';

import type { ResourceSectionProps } from '../../pages/AdminResourceDetailPage';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { ReasonModal } from '../ReasonModal';

export function MetadataImportCard({
  kind,
  resource,
  etag,
  refresh,
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
    mutationFn: (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        importResourceMetadata(
          kind,
          resource.id,
          {
            reason: input.reason,
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
      >
        <Stack gap="sm">
          {mutation.isSuccess && (
            <Alert color="green" variant="light">
              {t('admin.metadata.imported')}
            </Alert>
          )}
          {supportsDiscovery && (
            <Group justify="space-between" align="flex-end" wrap="nowrap">
              <TextInput
                label={t('admin.metadata.discoveryUrl')}
                description={t('admin.metadata.discoveryUrlHint')}
                placeholder="https://accounts.google.com"
                value={discoveryUrl}
                onChange={(event) => setDiscoveryUrl(event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                size="xs"
                variant="light"
                disabled={discoveryUrl.trim().length === 0}
                onClick={() => setModal('discovery')}
              >
                {t('admin.metadata.fetchDiscovery')}
              </Button>
            </Group>
          )}
          <Textarea
            value={metadata}
            onChange={(event) => setMetadata(event.currentTarget.value)}
            placeholder={
              format === 'saml' ? '<EntityDescriptor …>' : '{"issuer": "https://idp.example", …}'
            }
            autosize
            minRows={4}
            maxRows={12}
            ff="monospace"
          />
          <Button
            size="xs"
            variant="light"
            disabled={metadata.trim().length === 0}
            onClick={() => setModal('paste')}
          >
            {t('admin.metadata.submit')}
          </Button>
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
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(reason) => mutation.mutate({ reason })}
      />
    </>
  );
}
