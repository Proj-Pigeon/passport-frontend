import {
  Alert,
  Button,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminKeyRotationProtocol, AdminKeyRotationState } from '@/api/endpoints/admin/types';
import { approveAdminKeyRotation, createAdminKeyRotation } from '@/api/endpoints/admin/operations';
import { isApiError } from '@/api/errors';
import { AccountPageHeader, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';

import { AdminPageContainer } from '../components/AdminPageShell';
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
    <AdminPageContainer maw={1080}>
      <AccountPageHeader
        title={t('admin.keys.title')}
        subtitle={t('admin.keys.subtitle')}
        actions={
          <>
            {canCreate && (
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
            )}
            {canApprove && (
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  approveMutation.reset();
                  setApproveModal(true);
                }}
              >
                {t('admin.keys.approve')}
              </Button>
            )}
          </>
        }
      />

      {!canCreate && !canApprove && (
        <Alert color="yellow" variant="light">
          {t('admin.keys.noCapability')}
        </Alert>
      )}

      {(canCreate || canApprove) && (
        <SimpleGrid cols={{ base: 1, md: canCreate && canApprove ? 2 : 1 }} spacing="lg">
          {canCreate && (
            <SectionCard
              title={t('admin.keys.createCard')}
              description={t('admin.keys.createHint')}
              action={
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
              }
            >
              <Text size="sm" c="dimmed">
                {t('admin.keys.createConfirm')}
              </Text>
            </SectionCard>
          )}
          {canApprove && (
            <SectionCard
              title={t('admin.keys.approveCard')}
              description={t('admin.keys.approveHint')}
              action={
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => {
                    approveMutation.reset();
                    setApproveModal(true);
                  }}
                >
                  {t('admin.keys.approve')}
                </Button>
              }
            >
              <Text size="sm" c="dimmed">
                {rotationId
                  ? t('admin.keys.approveConfirm', {
                      id: rotationId,
                      state: targetState ? t(`admin.keys.state.${targetState}`) : '',
                    })
                  : t('admin.keys.approveHint')}
              </Text>
            </SectionCard>
          )}
        </SimpleGrid>
      )}

      <SectionCard title={t('admin.keys.historyCard')} description={t('admin.keys.historyHint')}>
        {history.length === 0 ? (
          <PageState kind="empty" title={t('admin.keys.historyEmpty')} minHeight={80} />
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.keys.rotationId')}</Table.Th>
                  <Table.Th>{t('admin.keys.protocol')}</Table.Th>
                  <Table.Th>{t('admin.keys.currentState')}</Table.Th>
                  <Table.Th>{t('admin.resources.colVersion')}</Table.Th>
                  {canApprove && <Table.Th />}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.map((entry) => (
                  <Table.Tr key={`${entry.id}-${entry.version}`}>
                    <Table.Td ff="monospace">{entry.id}</Table.Td>
                    <Table.Td>{entry.protocol.toUpperCase()}</Table.Td>
                    <Table.Td>
                      <AdminStatusBadge status={entry.state} />
                    </Table.Td>
                    <Table.Td>{entry.version}</Table.Td>
                    {canApprove && (
                      <Table.Td>
                        <Group justify="flex-end">
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => {
                              setRotationId(entry.id);
                              setVersion(String(entry.version));
                              approveMutation.reset();
                              setApproveModal(true);
                            }}
                          >
                            {t('admin.keys.approve')}
                          </Button>
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </SectionCard>

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
        extraFields={
          <Select
            label={t('admin.keys.protocol')}
            value={protocol}
            onChange={(value) => setProtocol((value as AdminKeyRotationProtocol | null) ?? 'oidc')}
            data={PROTOCOL_OPTIONS.map((value) => ({ value, label: value.toUpperCase() }))}
            allowDeselect={false}
          />
        }
        onSubmit={(reason) => createMutation.mutate({ reason })}
      />

      <ReasonModal
        opened={approveModal}
        onClose={() => (approveMutation.isPending ? undefined : setApproveModal(false))}
        title={t('admin.keys.approve')}
        description={
          rotationId.trim()
            ? t('admin.keys.approveConfirm', {
                id: rotationId.trim(),
                state: targetState ? t(`admin.keys.state.${targetState}`) : '',
              })
            : t('admin.keys.approveHint')
        }
        confirmLabel={t('admin.keys.approve')}
        confirmDisabled={rotationId.trim().length === 0}
        pending={approveMutation.isPending}
        error={approveMutation.error}
        errorHint={
          managerUnavailable(approveMutation.error)
            ? t('admin.keys.managerUnavailableHint')
            : undefined
        }
        extraFields={
          <Stack gap="sm">
            <TextInput
              label={t('admin.keys.rotationId')}
              value={rotationId}
              onChange={(event) => setRotationId(event.currentTarget.value)}
              placeholder="rot_…"
              required
              data-autofocus
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Select
                label={t('admin.keys.targetState')}
                value={targetState}
                onChange={(value) =>
                  setTargetState((value as AdminKeyRotationState | null) ?? 'published')
                }
                data={STATE_OPTIONS.map((value) => ({
                  value,
                  label: t(`admin.keys.state.${value}`),
                }))}
                allowDeselect={false}
              />
              <TextInput
                label={t('admin.keys.version')}
                value={version}
                onChange={(event) => setVersion(event.currentTarget.value)}
                placeholder="1"
              />
            </SimpleGrid>
          </Stack>
        }
        onSubmit={(reason) => approveMutation.mutate({ reason })}
      />
    </AdminPageContainer>
  );
}
