import {
  Anchor,
  Breadcrumbs,
  Button,
  Divider,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';

import type { AdminUserDetail } from '@/api/endpoints/admin/types';
import {
  getAdminUser,
  restoreAdminUser,
  revokeAdminUserSessions,
  suspendAdminUser,
} from '@/api/endpoints/admin/users';
import { isApiError } from '@/api/errors';
import { AccountPageHeader, InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

import { DevicesCard } from '@/features/devices/DevicesCard';
import { AdminPageContainer } from '../components/AdminPageShell';
import { PermissionGrantsCard } from '../components/PermissionGrantsCard';
import { adminKeys } from '../keys';
import { AdminStatusBadge } from '../components/AdminStatusBadge';
import { ReasonModal } from '../components/ReasonModal';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

type UserAction = 'suspend' | 'restore' | 'revokeSessions';

interface AdminUserDetailContextValue {
  user: AdminUserDetail;
  userId: string;
  canWrite: boolean;
}

export function AdminUserSectionRedirect() {
  const location = useLocation();
  return (
    <Navigate to={{ pathname: 'overview', search: location.search, hash: location.hash }} replace />
  );
}

export function AdminUserDetailPage() {
  const { t } = useTranslation();
  const { userId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useAdminSession();
  const stepUp = useAdminStepUp();
  const [action, setAction] = useState<UserAction | null>(null);

  const query = useQuery({
    queryKey: adminKeys.user(userId),
    queryFn: ({ signal }) => getAdminUser(userId, signal),
    enabled: userId.length > 0,
  });

  const mutation = useMutation({
    mutationFn: async ({ action: target, reason }: { action: UserAction; reason: string }) => {
      const run = () => {
        if (target === 'suspend') {
          return suspendAdminUser(userId, reason);
        }
        if (target === 'restore') {
          return restoreAdminUser(userId, reason);
        }
        return revokeAdminUserSessions(userId, reason);
      };
      return stepUp.runWithAdminStepUp(run);
    },
    onSuccess: async () => {
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.users });
      await queryClient.invalidateQueries({ queryKey: ['devices', userId] });
    },
  });

  const user = query.data;
  const canWrite = hasAdminCapability(session, 'users:write');
  const canReadAudit = hasAdminCapability(session, 'audit:read');
  const isSelf = session?.user_id === userId;

  if (query.isPending) {
    return <PageState kind="loading" />;
  }

  if (query.isError || !user) {
    return (
      <PageState
        kind="error"
        description={query.isError ? describeApiError(query.error) : undefined}
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  }

  const actionLabel: Record<UserAction, string> = {
    suspend: t('admin.users.suspend'),
    restore: t('admin.users.restore'),
    revokeSessions: t('admin.users.revokeSessions'),
  };

  const errorHint = (() => {
    if (!mutation.error || !isApiError(mutation.error)) {
      return undefined;
    }
    if (mutation.error.status === 409) {
      return t('admin.users.conflictHint');
    }
    if (mutation.error.status === 403 && isSelf) {
      return t('admin.users.selfHint');
    }
    return undefined;
  })();

  const segments = location.pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? 'overview';
  const activeTab = lastSegment === 'access' ? 'access' : 'overview';

  const contextValue: AdminUserDetailContextValue = {
    user,
    userId,
    canWrite,
  };

  return (
    <AdminPageContainer maw={1080}>
      <Breadcrumbs>
        <Anchor component={Link} to="/admin/users" size="sm">
          {t('admin.users.title')}
        </Anchor>
        <Anchor size="sm">{user.username}</Anchor>
      </Breadcrumbs>

      <AccountPageHeader
        title={user.display_name?.trim() || user.username}
        subtitle={
          <Group gap="sm" wrap="wrap">
            <AdminStatusBadge status={user.status} />
            <span>{user.id}</span>
          </Group>
        }
        actions={
          <>
            {canReadAudit && (
              <Anchor
                component={Link}
                to={`/admin/audit-events?resource_id=${encodeURIComponent(userId)}`}
                size="sm"
              >
                {t('authorization.audit')}
              </Anchor>
            )}
            {canWrite && (
              <>
                {user.status === 'suspended' ? (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => setAction('restore')}
                    disabled={isSelf}
                  >
                    {t('admin.users.restore')}
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    color="red"
                    variant="light"
                    onClick={() => setAction('suspend')}
                    disabled={isSelf}
                  >
                    {t('admin.users.suspend')}
                  </Button>
                )}
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => setAction('revokeSessions')}
                >
                  {t('admin.users.revokeSessions')}
                </Button>
              </>
            )}
          </>
        }
      />

      {isSelf && (
        <Text size="xs" c="dimmed">
          {t('admin.users.selfNotice')}
        </Text>
      )}

      <Tabs
        value={activeTab}
        onChange={(next) => {
          if (next) {
            navigate(next);
          }
        }}
      >
        <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          <Tabs.Tab value="overview">{t('admin.resourceTabs.overview')}</Tabs.Tab>
          <Tabs.Tab value="access">{t('admin.users.tabAccess')}</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Outlet context={contextValue} />

      <ReasonModal
        opened={action !== null}
        onClose={() => (mutation.isPending ? undefined : setAction(null))}
        title={action ? actionLabel[action] : ''}
        description={t('admin.users.actionConfirm', { username: user.username })}
        confirmLabel={action ? actionLabel[action] : ''}
        confirmColor={action === 'restore' ? undefined : 'red'}
        pending={mutation.isPending}
        error={mutation.error}
        errorHint={errorHint}
        onSubmit={(reason) => {
          if (action) {
            mutation.mutate({ action, reason });
          }
        }}
      />
    </AdminPageContainer>
  );
}

export function AdminUserOverviewSubpage() {
  const { t } = useTranslation();
  const { user } = useOutletContext<AdminUserDetailContextValue>();

  return (
    <Grid>
      <Grid.Col span={{ base: 12, md: 7 }}>
        <Stack gap="lg">
          <SectionCard title={t('admin.users.profileCard')}>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <InfoItem label={t('admin.users.colUsername')}>{user.username}</InfoItem>
              <InfoItem label={t('admin.users.colDisplayName')}>
                {user.display_name ?? '—'}
              </InfoItem>
              <InfoItem label={t('admin.users.colSecurityEpoch')}>{user.security_epoch}</InfoItem>
              <InfoItem label={t('admin.users.statusFilter')}>
                <AdminStatusBadge status={user.status} />
              </InfoItem>
              <InfoItem label={t('admin.users.colCreatedAt')}>
                {formatDateTime(user.created_at)}
              </InfoItem>
              <InfoItem label={t('admin.users.colUpdatedAt')}>
                {formatDateTime(user.updated_at)}
              </InfoItem>
            </SimpleGrid>
          </SectionCard>

          <SectionCard
            title={t('admin.users.securityCard')}
            description={t('admin.users.securityCardHint')}
            action={
              <Button component={Link} to="../access" size="xs" variant="light">
                {t('admin.users.tabAccess')}
              </Button>
            }
          >
            <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
              <InfoItem label={t('admin.users.hasPassword')}>
                {user.security.has_password ? t('common.yes') : t('common.no')}
              </InfoItem>
              <InfoItem label={t('admin.users.emailVerified')}>
                {user.security.email_verified ? t('common.yes') : t('common.no')}
              </InfoItem>
              <InfoItem label={t('admin.users.passkeyCount')}>
                {user.security.passkey_count}
              </InfoItem>
              <InfoItem label={t('admin.users.activeSessionCount')}>
                {user.security.active_session_count}
              </InfoItem>
              <InfoItem label={t('admin.users.activeGrantCount')}>
                {user.security.active_grant_count}
              </InfoItem>
            </SimpleGrid>
          </SectionCard>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 5 }}>
        <SectionCard title={t('admin.users.identitiesCard')}>
          {user.external_identities.length === 0 ? (
            <PageState kind="empty" minHeight={80} title={t('admin.users.noIdentities')} />
          ) : (
            <Stack gap={0}>
              {user.external_identities.map((identity, index) => (
                <Stack key={identity.id} gap={0}>
                  {index > 0 && <Divider my="sm" />}
                  <Group justify="space-between" gap="sm">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text size="sm" fw={500}>
                          {identity.provider}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {identity.provider_type}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {t('admin.users.identityLinkedAt', {
                          time: formatDateTime(identity.created_at) ?? '—',
                        })}
                        {identity.last_used_at
                          ? ` · ${t('admin.users.identityLastUsedAt', { time: formatDateTime(identity.last_used_at) ?? '—' })}`
                          : ''}
                      </Text>
                    </Stack>
                  </Group>
                </Stack>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Grid.Col>
    </Grid>
  );
}

export function AdminUserAccessSubpage() {
  const { userId, canWrite } = useOutletContext<AdminUserDetailContextValue>();
  return (
    <Stack gap="lg">
      <PermissionGrantsCard key={userId} userId={userId} />
      <DevicesCard userId={userId} canWrite={canWrite} />
    </Stack>
  );
}
