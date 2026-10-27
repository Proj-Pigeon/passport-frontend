import { Badge, Button, Group, Select, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { patchAdminResource } from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { ReasonModal } from '../ReasonModal';
import { APPLICATION_TYPES, applicationType } from './applicationPresets';
import type { ResourceSectionProps } from './resourceTypes';

export function ApplicationTypeBadge({ value }: { value: unknown }) {
  const { t } = useTranslation();
  const type = applicationType(value);
  return (
    <Badge variant="light" color={type ? 'blue' : 'gray'}>
      {type ? t('admin.applicationCreate.presets.' + type) : t('devices.unclassified')}
    </Badge>
  );
}

export function ApplicationTypeSection({
  resource,
  etag,
  refresh,
  canWrite,
}: ResourceSectionProps) {
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
    <Stack gap="xs">
      <Group gap="xs">
        <ApplicationTypeBadge value={locked} />
        <Text size="xs" c="dimmed">
          {t(locked ? 'devices.typeLocked' : 'devices.typeHint')}
        </Text>
      </Group>
      {!locked && canWrite && (
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label={t('devices.applicationType')}
            value={type}
            onChange={setType}
            data={APPLICATION_TYPES.map((value) => ({
              value,
              label: t('admin.applicationCreate.presets.' + value),
            }))}
            w={{ base: '100%', sm: 260 }}
          />
          <Button size="xs" disabled={!type} onClick={() => setConfirm(true)}>
            {t('common.submit')}
          </Button>
        </Group>
      )}
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
    </Stack>
  );
}

export function ApplicationTypeCard(props: ResourceSectionProps) {
  const { t } = useTranslation();
  return (
    <SectionCard title={t('devices.applicationType')}>
      <ApplicationTypeSection {...props} />
    </SectionCard>
  );
}
