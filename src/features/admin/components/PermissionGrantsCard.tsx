import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import {
  getPermissionGrants,
  listPermissions,
  putPermissionGrants,
  type PermissionDefinition,
  type PermissionGrants,
} from '@/api/endpoints/permissions';
import { isApiError } from '@/api/errors';
import { SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import {
  grantPreview,
  initialGrantSelection,
  permissionCatalog,
  type GrantSelection,
} from '@/features/permissions/grantPreview';
import { describeApiError } from '@/i18n/errors';
import { adminKeys } from '../keys';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';
import { ReasonModal } from './ReasonModal';

export function PermissionGrantsCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  const { data: session } = useAdminSession();
  const canReadCatalog = hasAdminCapability(session, 'applications:read');
  const grants = useQuery({
    queryKey: adminKeys.permissionGrants(userId),
    queryFn: ({ signal }) => getPermissionGrants(userId, signal),
    refetchOnWindowFocus: false,
  });
  const catalog = useQuery({
    queryKey: adminKeys.permissions,
    queryFn: ({ signal }) => listPermissions(signal),
    refetchOnWindowFocus: false,
    enabled: canReadCatalog,
  });
  const refresh = async () => {
    await Promise.all([grants.refetch(), ...(canReadCatalog ? [catalog.refetch()] : [])]);
    setRevision((value) => value + 1);
  };
  return (
    <SectionCard title={t('authorization.grantsTitle')} description={t('authorization.grantsHint')}>
      {grants.isPending || (canReadCatalog && catalog.isPending) ? (
        <PageState kind="loading" />
      ) : grants.isError || (canReadCatalog && catalog.isError) ? (
        <PageState
          kind="error"
          error={grants.error ?? catalog.error}
          description={describeApiError(grants.error ?? catalog.error)}
          onRetry={refresh}
        />
      ) : (
        <GrantEditor
          key={`${userId}-${revision}-${canReadCatalog}`}
          userId={userId}
          grants={grants.data.data}
          etag={grants.data.meta.etag ?? ''}
          definitions={canReadCatalog ? (catalog.data?.items ?? []) : []}
          catalogComplete={canReadCatalog && !!catalog.data}
          refresh={refresh}
        />
      )}
    </SectionCard>
  );
}

function GrantEditor({
  userId,
  grants,
  etag,
  definitions,
  catalogComplete,
  refresh,
}: {
  userId: string;
  grants: PermissionGrants;
  etag: string;
  definitions: PermissionDefinition[];
  catalogComplete: boolean;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { data: session } = useAdminSession();
  const { runWithAdminStepUp } = useAdminStepUp();
  const [baseline] = useState({
    grants,
    etag,
    definitions: permissionCatalog(definitions, grants),
  });
  const [selection, setSelection] = useState(() => initialGrantSelection(baseline.grants));
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const self = session?.user_id === userId;
  const canWrite = !!session?.roles.includes('super_admin') && !self && catalogComplete;
  const preview = grantPreview(baseline.grants, selection, baseline.definitions);
  const mutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!canWrite || !baseline.etag) return;
      await runWithAdminStepUp(() =>
        putPermissionGrants(userId, { ...selection, reason }, baseline.etag),
      );
    },
    onSuccess: async () => {
      setConfirm(false);
      await client.invalidateQueries({ queryKey: adminKeys.users });
      await refresh();
    },
  });
  const conflict = isApiError(mutation.error) && mutation.error.status === 412;
  const toggle = (key: keyof GrantSelection, id: string, checked: boolean) =>
    setSelection((current) => ({
      ...current,
      [key]: checked ? [...current[key], id] : current[key].filter((value) => value !== id),
    }));
  const roleLabel = (role: string) => t(`admin.roles.${role}`, { defaultValue: role });
  const permissionLabel = (id: string) => {
    const definition = baseline.definitions.find((item) => item.id === id);
    return definition
      ? `${definition.application_id ? `${definition.application_id} · ` : ''}${definition.name} (${definition.code})`
      : id;
  };
  const renderDefinitions = (application: boolean) => {
    const items = baseline.definitions.filter(
      (item) =>
        !!item.application_id === application &&
        `${item.name} ${item.code} ${item.application_id ?? ''} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    const key = application ? 'application_permission_ids' : 'builtin_permission_ids';
    return (
      <Stack gap="sm">
        <Text fw={600} size="sm">
          {t(application ? 'authorization.applicationGrants' : 'authorization.builtinGrants')}
        </Text>
        {items.length === 0 && (
          <Text size="sm" c="dimmed">
            {t('authorization.empty')}
          </Text>
        )}
        <ScrollArea.Autosize mah={320} scrollbars="y">
          <Stack gap="md" pe="xs">
            {items.map((definition) => {
              const checked = selection[key].includes(definition.id);
              const roles = !application ? (preview.inherited.get(definition.code) ?? []) : [];
              const details = [
                definition.name === definition.code ? '' : definition.code,
                definition.application_id ?? '',
                definition.description,
              ]
                .filter(Boolean)
                .join(' · ');
              const sources = [
                checked ? t('authorization.directSource') : '',
                roles.length > 0
                  ? t('authorization.roleSource', { roles: roles.map(roleLabel).join(', ') })
                  : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Group key={definition.id} justify="space-between" align="flex-start" wrap="nowrap">
                  <Checkbox
                    label={definition.name}
                    description={
                      details || sources ? (
                        <>
                          {details && (
                            <Text component="span" display="block" size="xs" c="dimmed">
                              {details}
                            </Text>
                          )}
                          {sources && (
                            <Text component="span" display="block" size="xs" c="dimmed" mt={2}>
                              {sources}
                            </Text>
                          )}
                        </>
                      ) : undefined
                    }
                    checked={checked}
                    disabled={
                      !canWrite ||
                      mutation.isPending ||
                      definition.status === 'deleted' ||
                      (definition.status === 'disabled' &&
                        !initialGrantSelection(baseline.grants)[key].includes(definition.id))
                    }
                    onChange={(event) => toggle(key, definition.id, event.currentTarget.checked)}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <Badge variant="light" style={{ flexShrink: 0 }}>
                    {t(`authorization.status.${definition.status}`)}
                  </Badge>
                </Group>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    );
  };
  const changes = [
    { label: t('authorization.roles'), change: preview.roles, labelOf: roleLabel },
    { label: t('authorization.builtinGrants'), change: preview.builtin, labelOf: permissionLabel },
    {
      label: t('authorization.applicationGrants'),
      change: preview.applications,
      labelOf: permissionLabel,
    },
  ];
  const previewContent = (
    <Stack gap="sm">
      {changes.map(({ label, change, labelOf }) => (
        <Stack key={label} gap={4}>
          <Text fw={500}>{label}</Text>
          <Text size="sm">
            {t('authorization.added')}:{' '}
            {change.added.map(labelOf).join(', ') || t('authorization.none')}
          </Text>
          <Text size="sm">
            {t('authorization.removed')}:{' '}
            {change.removed.map(labelOf).join(', ') || t('authorization.none')}
          </Text>
        </Stack>
      ))}
      <Alert color="yellow">{t('authorization.inheritanceHint')}</Alert>
      <Text size="sm">
        {t('authorization.inheritedRemaining')}:{' '}
        {[...preview.inherited.keys()].sort().join(', ') || t('authorization.none')}
      </Text>
      <Text size="sm">
        {t('authorization.effectivePreview')}:{' '}
        {preview.effective.join(', ') || t('authorization.none')}
      </Text>
      <Text size="sm">
        {t('authorization.applicationPreview')}:{' '}
        {preview.appEffective.map((item) => `${item.application_id} · ${item.code}`).join(', ') ||
          t('authorization.none')}
      </Text>
    </Stack>
  );
  return (
    <Stack gap="md">
      {!canWrite && (
        <Alert>{t(self ? 'authorization.noSelf' : 'authorization.superAdminOnly')}</Alert>
      )}
      <Text size="sm">
        {t('authorization.currentEffective')}:{' '}
        {baseline.grants.effective_capabilities.join(', ') || t('authorization.none')}
      </Text>
      <Stack gap="xs">
        <Text fw={600} size="sm">
          {t('authorization.roles')}
        </Text>
        <Group gap="md" wrap="wrap">
          {Object.keys(baseline.grants.role_capabilities).map((role) => (
            <Checkbox
              key={role}
              label={roleLabel(role)}
              checked={selection.roles.includes(role)}
              disabled={!canWrite || mutation.isPending}
              onChange={(event) => toggle('roles', role, event.currentTarget.checked)}
            />
          ))}
        </Group>
      </Stack>
      <TextInput
        label={t('authorization.searchApplications')}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {renderDefinitions(false)}
        {renderDefinitions(true)}
      </SimpleGrid>
      {canWrite && (
        <>
          <Divider />
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t('authorization.previewTitle')}
            </Text>
            <Text size="sm">
              {t('authorization.inheritedRemaining')}:{' '}
              {[...preview.inherited.keys()].sort().join(', ') || t('authorization.none')}
            </Text>
            <Text size="sm">
              {t('authorization.effectivePreview')}:{' '}
              {preview.effective.join(', ') || t('authorization.none')}
            </Text>
          </Stack>
        </>
      )}
      <Group>
        {canWrite && (
          <Button
            size="xs"
            disabled={!preview.changed || !baseline.etag || conflict}
            onClick={() => {
              mutation.reset();
              setConfirm(true);
            }}
          >
            {t('authorization.reviewSave')}
          </Button>
        )}
        <Button size="xs" variant="default" onClick={refresh} disabled={mutation.isPending}>
          {t('authorization.refresh')}
        </Button>
        {hasAdminCapability(session, 'audit:read') && (
          <Anchor
            component={Link}
            to={`/admin/audit-events?resource_id=${encodeURIComponent(userId)}`}
            size="sm"
          >
            {t('authorization.audit')}
          </Anchor>
        )}
      </Group>
      <ReasonModal
        opened={confirm}
        onClose={() => {
          if (!mutation.isPending) setConfirm(false);
        }}
        title={t('authorization.previewTitle')}
        confirmLabel={t('common.save')}
        required
        minReasonLength={3}
        pending={mutation.isPending}
        error={mutation.error}
        confirmDisabled={!canWrite || conflict || !baseline.etag}
        extraFields={
          <Stack>
            {previewContent}
            {conflict && <Button onClick={refresh}>{t('authorization.refresh')}</Button>}
          </Stack>
        }
        onSubmit={(reason) => mutation.mutate(reason)}
      />
    </Stack>
  );
}
