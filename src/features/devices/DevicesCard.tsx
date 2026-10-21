import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { listDevices, revokeDevice, type Device } from '@/api/endpoints/devices';
import { resetCsrfToken } from '@/api/csrf';
import { SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { ReasonModal } from '@/features/admin/components/ReasonModal';
import { useAdminStepUp } from '@/features/admin/step-up/useAdminStepUp';
import { isStepUpAborted } from '@/features/step-up/useStepUp';
import { formatDateTime } from '@/lib/format';
import { useDeviceStepUp } from './useDeviceStepUp';

export function DevicesCard({ userId, canWrite = true }: { userId?: string; canWrite?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const modals = useModals();
  const navigate = useNavigate();
  const deviceStepUp = useDeviceStepUp();
  const adminStepUp = useAdminStepUp();
  const [target, setTarget] = useState<Device | null>(null);
  const key = ['devices', userId ?? 'me'];
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => listDevices(pageParam, signal, userId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const mutation = useMutation({
    mutationFn: ({ device, reason }: { device: Device; reason?: string }) => {
      const run = () => revokeDevice(device.id, userId, reason);
      return userId
        ? adminStepUp.runWithAdminStepUp(run)
        : device.current
          ? run()
          : deviceStepUp.run(run);
    },
    onSuccess: async (_, { device }) => {
      setTarget(null);
      if (!userId && device.current) {
        resetCsrfToken();
        queryClient.clear();
        navigate('/login', { replace: true });
      } else {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
  function confirm(device: Device) {
    mutation.reset();
    if (userId) {
      setTarget(device);
      return;
    }
    modals.openConfirmModal({
      title: t(device.current ? 'devices.revokeCurrent' : 'devices.revoke'),
      children: (
        <Text size="sm">
          {t(device.current ? 'devices.currentWarning' : 'devices.revokeWarning', {
            name: device.device_name,
          })}
        </Text>
      ),
      labels: { confirm: t('devices.revoke'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => mutation.mutate({ device }),
    });
  }
  return (
    <SectionCard title={t('devices.title')} description={t('devices.listHint')}>
      <Stack>
        {query.isPending ? (
          <PageState kind="loading" />
        ) : query.isError ? (
          <>
            <SubmitErrorAlert error={query.error} />
            <Button onClick={() => query.refetch()}>{t('common.retry')}</Button>
          </>
        ) : (
          (() => {
            const items = query.data.pages
              .flatMap((page) => page.items)
              .filter((device) => (userId ? true : device.kind !== 'application'));
            return (
              <>
                {items.length === 0 && <Text c="dimmed">{t('devices.empty')}</Text>}
                {items.map((device) => (
                  <Paper key={device.id} withBorder p="md" radius="md">
                    <Stack gap="xs" style={{ minWidth: 0 }}>
                      <Group gap="xs">
                        <Badge variant="light">{t(`devices.${device.kind}`)}</Badge>
                        {device.current && <Badge color="teal">{t('devices.current')}</Badge>}
                      </Group>
                      <Text fw={500} style={{ overflowWrap: 'anywhere' }}>
                        {device.device_name}
                      </Text>
                      <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                        {[device.platform, device.client_name].filter(Boolean).join(' · ')}
                      </Text>
                      <Text size="sm">
                        {t('devices.lastActive', { time: formatDateTime(device.last_active_at) })}
                      </Text>
                      {device.scopes.length > 0 && (
                        <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                          {device.scopes.join(' · ')}
                        </Text>
                      )}
                      {canWrite && (
                        <Group>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            disabled={mutation.isPending}
                            onClick={() => confirm(device)}
                          >
                            {t(
                              device.current && !userId
                                ? 'devices.revokeCurrent'
                                : 'devices.revoke',
                            )}
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </>
            );
          })()
        )}
        {query.hasNextPage && (
          <Button
            variant="default"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('devices.more')}
          </Button>
        )}
        {!isStepUpAborted(mutation.error) && <SubmitErrorAlert error={mutation.error} />}
      </Stack>
      <ReasonModal
        opened={target !== null}
        onClose={() => {
          if (!mutation.isPending) setTarget(null);
        }}
        title={t('devices.revoke')}
        description={t('devices.revokeWarning', { name: target?.device_name })}
        confirmLabel={t('devices.revoke')}
        confirmColor="red"
        required
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(reason) => {
          if (target) mutation.mutate({ device: target, reason });
        }}
      />
    </SectionCard>
  );
}
