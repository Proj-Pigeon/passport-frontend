import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Collapse,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useModals } from '@mantine/modals';
import {
  IconCalendar,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconShield,
  IconTool,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  listAuthorizedApplications,
  revokeAuthorizedApplication,
  type AuthorizedApplication,
} from '@/api/endpoints/devices';
import { resolveAssetUrl } from '@/api/http';
import { SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { formatDate } from '@/lib/format';

const KNOWN_SCOPES = ['openid', 'profile', 'email'] as const;

export function AuthorizedAppsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const modals = useModals();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const platform = t('common.platformName');
  const key = ['applications', 'me'];

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => listAuthorizedApplications(signal),
  });

  const mutation = useMutation({
    mutationFn: (app: AuthorizedApplication) => revokeAuthorizedApplication(app.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ['devices', 'me'] }),
      ]);
    },
  });

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function scopeTitle(scope: string): string {
    return (KNOWN_SCOPES as readonly string[]).includes(scope)
      ? t(`oauth.scopes.${scope}.title`)
      : scope;
  }

  function scopeDescription(scope: string): string {
    return (KNOWN_SCOPES as readonly string[]).includes(scope)
      ? t(`oauth.scopes.${scope}.description`, { platform })
      : t('oauth.scopes.unknownDescription', { scope });
  }

  function confirmRevoke(app: AuthorizedApplication) {
    mutation.reset();
    modals.openConfirmModal({
      title: t('applications.revokeTitle'),
      children: (
        <Text size="sm">{t('applications.revokeConfirm', { appName: app.client_name })}</Text>
      ),
      labels: { confirm: t('applications.revoke'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => mutation.mutate(app),
    });
  }

  const items = query.data?.items ?? [];

  return (
    <SectionCard title={t('applications.title')} description={t('applications.listHint')}>
      <Stack>
        {query.isPending ? (
          <PageState kind="loading" />
        ) : query.isError ? (
          <>
            <SubmitErrorAlert error={query.error} />
            <Group>
              <UnstyledButton onClick={() => query.refetch()}>
                <Text size="sm" c="blue" fw={500}>
                  {t('common.retry')}
                </Text>
              </UnstyledButton>
            </Group>
          </>
        ) : items.length === 0 ? (
          <Text c="dimmed">{t('applications.empty')}</Text>
        ) : (
          items.map((app) => {
            const expanded = Boolean(expandedIds[app.id]);
            const authorizedDate = formatDate(app.authorized_at) ?? t('account.overview.unknown');
            return (
              <Paper key={app.id} withBorder radius="md">
                <Group justify="space-between" align="center" wrap="nowrap" p="md" gap="sm">
                  <Group gap="md" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <Avatar
                      src={resolveAssetUrl(app.logo_url)}
                      alt={app.client_name}
                      size={48}
                      radius="md"
                    >
                      {app.client_name.slice(0, 1).toUpperCase()}
                    </Avatar>
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Group gap={6} align="center" wrap="nowrap">
                        <Text fw={600} lineClamp={1} style={{ minWidth: 0 }}>
                          {app.client_name}
                        </Text>
                        {app.developer_url && (
                          <Anchor
                            href={app.developer_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={app.client_name}
                            style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
                          >
                            <IconExternalLink size={16} stroke={1.75} />
                          </Anchor>
                        )}
                      </Group>
                      <Group gap="md" wrap="wrap">
                        {app.developer_name && (
                          <Group gap={4} wrap="nowrap">
                            <IconTool size={14} stroke={1.5} color="var(--mantine-color-dimmed)" />
                            <Text size="xs" c="dimmed">
                              {app.developer_name}
                            </Text>
                          </Group>
                        )}
                        <Group gap={4} wrap="nowrap">
                          <IconCalendar
                            size={14}
                            stroke={1.5}
                            color="var(--mantine-color-dimmed)"
                          />
                          <Text size="xs" c="dimmed">
                            {t('applications.authorizedAt', { time: authorizedDate })}
                          </Text>
                        </Group>
                      </Group>
                    </Stack>
                  </Group>
                  <Tooltip label={t('applications.revoke')}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t('applications.revokeAria', { appName: app.client_name })}
                      disabled={mutation.isPending}
                      loading={mutation.isPending && mutation.variables?.id === app.id}
                      onClick={() => confirmRevoke(app)}
                    >
                      <IconTrash size={18} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
                <Divider />
                <Stack gap="sm" p="md">
                  <UnstyledButton
                    onClick={() => toggleExpanded(app.id)}
                    aria-expanded={expanded}
                    style={{ width: '100%' }}
                  >
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap">
                        <ThemeIcon size={28} radius="xl" variant="light">
                          <IconShield size={16} stroke={1.5} />
                        </ThemeIcon>
                        <Text size="sm" fw={500}>
                          {t('applications.scopesTitle', { count: app.scopes.length })}
                        </Text>
                      </Group>
                      {expanded ? (
                        <IconChevronUp size={16} stroke={1.5} color="var(--mantine-color-dimmed)" />
                      ) : (
                        <IconChevronDown
                          size={16}
                          stroke={1.5}
                          color="var(--mantine-color-dimmed)"
                        />
                      )}
                    </Group>
                  </UnstyledButton>
                  {!expanded && app.scopes.length > 0 && (
                    <Group gap="xs" wrap="wrap">
                      {app.scopes.map((scope) => (
                        <Badge key={scope} variant="light" radius="xl" tt="none">
                          {scopeTitle(scope)}
                        </Badge>
                      ))}
                    </Group>
                  )}
                  <Collapse expanded={expanded}>
                    <Stack gap="xs">
                      {app.scopes.map((scope) => (
                        <Paper
                          key={scope}
                          withBorder
                          p="sm"
                          radius="sm"
                          bg="var(--mantine-color-default-hover)"
                        >
                          <Stack gap={2}>
                            <Text size="sm" fw={600}>
                              {scopeTitle(scope)}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {scopeDescription(scope)}
                            </Text>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Collapse>
                </Stack>
              </Paper>
            );
          })
        )}
        <SubmitErrorAlert error={mutation.error} />
      </Stack>
    </SectionCard>
  );
}
