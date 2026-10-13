import { Button, Stack, TagsInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { patchAdminResource } from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';
import type { ResourceSectionProps } from '../pages/AdminResourceDetailPage';
import { ReasonModal } from '../components/ReasonModal';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

export function FederationScopesCard({
  resource,
  etag,
  refresh,
  canWrite = true,
}: ResourceSectionProps) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const original = Array.isArray(resource.configuration['scopes'])
    ? resource.configuration['scopes'].filter((value): value is string => typeof value === 'string')
    : [];
  const [scopes, setScopes] = useState(original);
  const [opened, setOpened] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        patchAdminResource(
          'federation',
          resource.id,
          { ...input, configuration: { scopes } },
          etag,
        ),
      ),
    onSuccess: async () => {
      setOpened(false);
      await refresh();
    },
  });
  if (resource.configuration['provider_type'] === 'saml') return null;
  return (
    <SectionCard title={t('admin.federation.scopes')}>
      <Stack gap="sm">
        <TagsInput
          disabled={!canWrite}
          label={t('admin.federation.scopes')}
          value={scopes}
          onChange={setScopes}
          clearable
        />
        <Button
          size="xs"
          disabled={!canWrite || JSON.stringify(scopes) === JSON.stringify(original)}
          onClick={() => setOpened(true)}
        >
          {t('common.save')}
        </Button>
        <ReasonModal
          opened={opened}
          onClose={() => setOpened(false)}
          title={t('admin.federation.scopes')}
          confirmLabel={t('common.save')}
          pending={mutation.isPending}
          error={mutation.error}
          onSubmit={(reason) => mutation.mutate({ reason })}
        />
      </Stack>
    </SectionCard>
  );
}
