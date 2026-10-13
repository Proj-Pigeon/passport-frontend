import { Alert, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminKeyRotationProtocol, AdminKeyRotationState } from '@/api/endpoints/admin/types';
import { approveAdminKeyRotation, createAdminKeyRotation } from '@/api/endpoints/admin/operations';
import { isApiError } from '@/api/errors';
import { AccountPageHeader, SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';

import { AdminStatusBadge } from '../components/AdminStatusBadge';
import { ReasonModal } from '../components/ReasonModal';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

const PROTOCOL_OPTIONS: AdminKeyRotationProtocol[] = ['oidc', 'saml'];

const STATE_OPTIONS: AdminKeyRotationState[] = ['staged', 'published', 'active', 'retiring'];

interface RotationHistoryEntry {
  id: string;
  protocol: string;
  state: string;
  version: number;
}

export function AdminKeyRotationsPage() {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const { data: session } = useAdminSession();
  const canCreate = hasAdminCapability(session, 'keys:write');
  const canApprove = hasAdminCapability(session, 'keys:approve');

  const [protocol, setProtocol] = useState<AdminKeyRotationProtocol | null>('oidc');
  const [createModal, setCreateModal] = useState(false);

  const [rotationId, setRotationId] = useState('');
  const [targetState, setTargetState] = useState<AdminKeyRotationState | null>('published');
  const [version, setVersion] = useState('1');
  const [approveModal, setApproveModal] = useState(false);

  const [history, setHistory] = useState<RotationHistoryEntry[]>([]);

  const createMutation = useMutation({
    mutationFn: (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        createAdminKeyRotation({ reason: input.reason, protocol: protocol ?? 'oidc' }),
      ),
    onSuccess: (data) => {
      setCreateModal(false);
      setHistory((previous) => [data, ...previous].slice(0, 10));
      setRotationId(data.id);
      setVersion(String(data.version));
    },
  });

  const approveMutation = useMutation({
    mutationFn: (input: { reason: string }) =>
      stepUp.runWithAdminStepUp(() =>
        approveAdminKeyRotation(
          rotationId.trim(),
          { reason: input.reason, state: targetState ?? 'published' },
          `"${version.trim() || '1'}"`,
        ),
      ),
    onSuccess: (data) => {
      setApproveModal(false);
      setHistory((previous) => [data, ...previous].slice(0, 10));
      setVersion(String(data.version));
    },
  });

  const managerUnavailable = (error: unknown) =>
    isApiError(error) && error.code === 'key_manager_unavailable';

  return (
    <Stack gap="lg" maw={860}>
      <AccountPageHeader title={t('admin.keys.title')} subtitle={t('admin.keys.subtitle')} />

      {canCreate && (
        <SectionCard title={t('admin.keys.createCard')} description={t('admin.keys.createHint')}>
          <Stack gap="sm">
            <Select
              label={t('admin.keys.protocol')}
              value={protocol}
              onChange={setProtocol}
              data={PROTOCOL_OPTIONS.map((value) => ({ value, label: value.toUpperCase() }))}
              w={200}
            />
            <Group>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  createMutation.reset();
                  setCreateModal(true);
                }}
              >
                {t('admin.keys.create')}
              </Button>
            </Group>
            {createMutation.error && (
              <Alert color="red" variant="light" title={t('errors.title')}>
                <Text size="sm">{describeApiError(createMutation.error)}</Text>
                {managerUnavailable(createMutation.error) && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('admin.keys.managerUnavailableHint')}
                  </Text>
                )}
              </Alert>
            )}
          </Stack>
        </SectionCard>
      )}

      {canApprove && (
        <SectionCard title={t('admin.keys.approveCard')} description={t('admin.keys.approveHint')}>
          <Stack gap="sm">
            <TextInput
              label={t('admin.keys.rotationId')}
              value={rotationId}
              onChange={(event) => setRotationId(event.currentTarget.value)}
              placeholder="rot_…"
              w={320}
            />
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Select
                label={t('admin.keys.targetState')}
                value={targetState}
                onChange={setTargetState}
                data={STATE_OPTIONS.map((value) => ({
                  value,
                  label: t(`admin.keys.state.${value}`),
                }))}
                w={200}
              />
              <TextInput
                label={t('admin.keys.version')}
                value={version}
                onChange={(event) => setVersion(event.currentTarget.value)}
                placeholder="1"
                w={120}
              />
              <Button
                size="xs"
                variant="light"
                disabled={rotationId.trim().length === 0}
                onClick={() => {
                  approveMutation.reset();
                  setApproveModal(true);
                }}
              >
                {t('admin.keys.approve')}
              </Button>
            </Group>
            {approveMutation.error && (
              <Alert color="red" variant="light" title={t('errors.title')}>
                <Text size="sm">{describeApiError(approveMutation.error)}</Text>
                {managerUnavailable(approveMutation.error) && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {t('admin.keys.managerUnavailableHint')}
                  </Text>
                )}
              </Alert>
            )}
          </Stack>
        </SectionCard>
      )}

      <ReasonModal
        opened={createModal}
        onClose={() => (createMutation.isPending ? undefined : setCreateModal(false))}
        title={t('admin.keys.create')}
        description={t('admin.keys.createConfirm')}
        confirmLabel={t('admin.keys.create')}
        pending={createMutation.isPending}
        error={createMutation.error}
        errorHint={
          managerUnavailable(createMutation.error)
            ? t('admin.keys.managerUnavailableHint')
            : undefined
        }
        onSubmit={(reason) => createMutation.mutate({ reason })}
      />

      <ReasonModal
        opened={approveModal}
        onClose={() => (approveMutation.isPending ? undefined : setApproveModal(false))}
        title={t('admin.keys.approve')}
        description={t('admin.keys.approveConfirm', {
          id: rotationId,
          state: targetState ? t(`admin.keys.state.${targetState}`) : '',
        })}
        confirmLabel={t('admin.keys.approve')}
        pending={approveMutation.isPending}
        error={approveMutation.error}
        errorHint={
          managerUnavailable(approveMutation.error)
            ? t('admin.keys.managerUnavailableHint')
            : undefined
        }
        onSubmit={(reason) => approveMutation.mutate({ reason })}
      />

      {history.length > 0 && (
        <SectionCard title={t('admin.keys.historyCard')} description={t('admin.keys.historyHint')}>
          <Table.ScrollContainer minWidth={560}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.keys.rotationId')}</Table.Th>
                  <Table.Th>{t('admin.keys.protocol')}</Table.Th>
                  <Table.Th>{t('admin.keys.currentState')}</Table.Th>
                  <Table.Th>{t('admin.resources.colVersion')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((entry) => (
                  <Table.Tr key={`${entry.id}-${entry.version}`}>
                    <Table.Td ff="monospace">{entry.id}</Table.Td>
                    <Table.Td>{entry.protocol}</Table.Td>
                    <Table.Td>
                      <AdminStatusBadge status={entry.state} />
                    </Table.Td>
                    <Table.Td>{entry.version}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </SectionCard>
      )}

      {!canCreate && !canApprove && (
        <Alert color="yellow" variant="light">
          {t('admin.keys.noCapability')}
        </Alert>
      )}
    </Stack>
  );
}
