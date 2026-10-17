import { Badge, Button, Select, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { patchAdminResource } from '@/api/endpoints/admin/resources';
import type { ResourceSectionProps } from '../../pages/AdminResourceDetailPage';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { SectionCard } from '@/components/AccountSections';
import { ReasonModal } from '../ReasonModal';
import { APPLICATION_TYPES, applicationType } from './applicationPresets';

export function ApplicationTypeBadge({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const type = applicationType(value);
  return (
    <Badge variant="light" color={type ? 'blue' : 'gray'}>
      {type ? t('admin.applicationCreate.presets.' + type) : t('devices.unclassified')}
    </Badge>
  );
}

export function ApplicationTypeCard({ resource, etag, refresh, canWrite }: ResourceSectionProps) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const [type, setType] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const locked =
    applicationType(resource.configuration['application_type']) ??
    applicationType(resource.published_configuration?.['application_type']);
  const mutation = useMutation({
    mutationFn: (reason: string) =>
      stepUp.runWithAdminStepUp(() =>
        patchAdminResource(
          'application',
          resource.id,
          { reason, configuration: { ...resource.configuration, application_type: type } },
          etag,
        ),
      ),
    onSuccess: async () => {
      setConfirm(false);
      await refresh();
    },
  });
  return (
    <SectionCard title={t('devices.applicationType')}>
      <Stack>
        <ApplicationTypeBadge value={locked} />
        <Text size="sm" c="dimmed">
          {t(locked ? 'devices.typeLocked' : 'devices.typeHint')}
        </Text>
        {!locked && canWrite && (
          <>
            <Select
              label={t('devices.applicationType')}
              value={type}
              onChange={setType}
              data={APPLICATION_TYPES.map((value) => ({
                value,
                label: t('admin.applicationCreate.presets.' + value),
              }))}
            />
            <Button disabled={!type} onClick={() => setConfirm(true)}>
              {t('common.submit')}
            </Button>
          </>
        )}
      </Stack>
      <ReasonModal
        opened={confirm}
        onClose={() => {
          if (!mutation.isPending) setConfirm(false);
        }}
        title={t('devices.applicationType')}
        description={t('devices.typeHint')}
        confirmLabel={t('common.submit')}
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(reason) => mutation.mutate(reason)}
      />
    </SectionCard>
  );
}
