import {
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ApiScope } from '@/api/csrf';
import { isApiError } from '@/api/errors';
import {
  createApplicationPermission,
  deleteApplicationPermission,
  initializeGuEarthPermissions,
  listApplicationPermissions,
  updateApplicationPermission,
  type PermissionDefinition,
} from '@/api/endpoints/permissions';
import { SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { ReasonModal } from '@/features/admin/components/ReasonModal';
import { adminKeys } from '@/features/admin/keys';
import { queryKeys } from '@/features/session/keys';
import { describeApiError } from '@/i18n/errors';

export interface PermissionCatalogProps {
  scope: ApiScope;
  applicationId: string;
  canWrite: boolean;
  runProtected: <T>(action: () => Promise<T>) => Promise<T>;
}

type CatalogAction =
  { kind: 'create' | 'preset' } | { kind: 'edit' | 'delete'; definition: PermissionDefinition };

export function PermissionCatalog({
  scope,
  applicationId,
  canWrite,
  runProtected,
}: PermissionCatalogProps) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key =
    scope === 'admin'
      ? adminKeys.applicationPermissions(applicationId)
      : queryKeys.developerPermissions(applicationId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listApplicationPermissions(scope, applicationId, signal),
  });
  const [action, setAction] = useState<CatalogAction | null>(null);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canWrite || !action) return;
      await runProtected(async () => {
        if (action.kind === 'preset') {
          if (scope !== 'admin') return;
          await initializeGuEarthPermissions(applicationId);
        } else if (action.kind === 'delete') {
          await deleteApplicationPermission(scope, applicationId, action.definition);
        } else if (action.kind === 'edit') {
          await updateApplicationPermission(scope, applicationId, action.definition, {
            name: name.trim(),
            description: description.trim(),
            status,
          });
        } else {
          await createApplicationPermission(scope, applicationId, {
            code: code.trim(),
            name: name.trim(),
            description: description.trim(),
          });
        }
      });
    },
    onSuccess: async () => {
      setAction(null);
      await client.invalidateQueries({ queryKey: key });
      if (scope === 'admin') {
        await client.invalidateQueries({ queryKey: adminKeys.permissions });
        await client.invalidateQueries({ queryKey: adminKeys.users });
      }
    },
  });
  const conflict = isApiError(mutation.error) && mutation.error.status === 412;
  const open = (next: CatalogAction) => {
    mutation.reset();
    setAction(next);
    const definition = 'definition' in next ? next.definition : undefined;
    setCode(definition?.code ?? '');
    setName(definition?.name ?? '');
    setDescription(definition?.description ?? '');
    setStatus(definition?.status === 'disabled' ? 'disabled' : 'active');
  };
  const labels = {
    create: t('authorization.createPermission'),
    edit: t('authorization.editPermission'),
    delete: t('common.delete'),
    preset: t('authorization.preset'),
  };
  const editing = action?.kind === 'edit' || action?.kind === 'create';
  const items =
    query.data?.items.filter((item) =>
      `${item.name} ${item.code} ${item.description}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  return (
    <SectionCard
      title={t('authorization.catalogTitle')}
      description={t('authorization.catalogHint')}
      action={
        canWrite ? (
          <Group gap="xs" wrap="wrap">
            {scope === 'admin' && (
              <Button size="xs" variant="default" onClick={() => open({ kind: 'preset' })}>
                {t('authorization.preset')}
              </Button>
            )}
            <Button size="xs" variant="light" onClick={() => open({ kind: 'create' })}>
              {t('authorization.createPermission')}
            </Button>
          </Group>
        ) : undefined
      }
    >
      <Stack gap="sm">
        {!canWrite && <Alert>{t('authorization.readOnly')}</Alert>}
        <TextInput
          label={t('authorization.search')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {query.isPending ? (
          <PageState kind="loading" />
        ) : query.isError ? (
          <PageState
            kind="error"
            error={query.error}
            description={describeApiError(query.error)}
            onRetry={() => query.refetch()}
          />
        ) : items.length === 0 ? (
          <PageState kind="empty" title={t('authorization.empty')} minHeight={80} />
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('authorization.name')}</Table.Th>
                  <Table.Th>{t('authorization.code')}</Table.Th>
                  <Table.Th>{t('authorization.statusLabel')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((definition) => (
                  <Table.Tr key={definition.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {definition.name}
                        </Text>
                        {definition.description && (
                          <Text size="xs" c="dimmed">
                            {definition.description}
                          </Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace">
                        {definition.code}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">
                        {t(`authorization.status.${definition.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {canWrite && definition.status !== 'deleted' && (
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          <Button
                            size="compact-sm"
                            variant="light"
                            onClick={() => open({ kind: 'edit', definition })}
                          >
                            {t('authorization.editPermission')}
                          </Button>
                          <Button
                            size="compact-sm"
                            variant="light"
                            color="red"
                            onClick={() => open({ kind: 'delete', definition })}
                          >
                            {t('common.delete')}
                          </Button>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <ReasonModal
          opened={action !== null}
          onClose={() => {
            if (!mutation.isPending) setAction(null);
          }}
          title={action ? labels[action.kind] : ''}
          confirmLabel={t('common.confirm')}
          confirmColor={action?.kind === 'delete' ? 'red' : undefined}
          pending={mutation.isPending}
          error={mutation.error}
          confirmDisabled={!canWrite || conflict || (editing && (!name.trim() || !code.trim()))}
          description={
            action?.kind === 'preset'
              ? t('authorization.presetHint')
              : action?.kind === 'delete'
                ? t('authorization.deleteHint', { code })
                : t('authorization.editHint')
          }
          extraFields={
            <Stack>
              {editing && (
                <>
                  <TextInput
                    label={t('authorization.code')}
                    required
                    value={code}
                    readOnly={action.kind === 'edit'}
                    onChange={(event) => setCode(event.currentTarget.value)}
                    data-autofocus={action.kind === 'create' ? true : undefined}
                  />
                  <TextInput
                    label={t('authorization.name')}
                    required
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    data-autofocus={action.kind === 'edit' ? true : undefined}
                  />
                  <Textarea
                    label={t('authorization.description')}
                    value={description}
                    onChange={(event) => setDescription(event.currentTarget.value)}
                    autosize
                    minRows={2}
                  />
                  {action.kind === 'edit' && (
                    <Select
                      label={t('authorization.statusLabel')}
                      value={status}
                      allowDeselect={false}
                      onChange={(value) => setStatus(value === 'disabled' ? 'disabled' : 'active')}
                      data={[
                        { value: 'active', label: t('authorization.status.active') },
                        { value: 'disabled', label: t('authorization.status.disabled') },
                      ]}
                    />
                  )}
                  {action.kind === 'edit' && status !== action.definition.status && (
                    <Alert color="yellow">
                      {t(
                        status === 'active'
                          ? 'authorization.enableHint'
                          : 'authorization.disableHint',
                      )}
                    </Alert>
                  )}
                </>
              )}
              {action &&
                'definition' in action &&
                (action.kind === 'delete' || status !== action.definition.status) && (
                  <Text size="sm">
                    {t('authorization.affectedGrants', { count: action.definition.grant_count })}
                  </Text>
                )}
              {conflict && (
                <Button
                  variant="light"
                  onClick={async () => {
                    setAction(null);
                    mutation.reset();
                    await query.refetch();
                  }}
                >
                  {t('authorization.refresh')}
                </Button>
              )}
            </Stack>
          }
          onSubmit={() => mutation.mutate()}
        />
      </Stack>
    </SectionCard>
  );
}
