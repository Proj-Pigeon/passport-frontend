import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { AuthenticationMethod } from '@/api/types';
import { AccountAvatar } from '@/components/AccountAvatar';
import { AccountPageHeader, InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { usePasskeys } from '@/features/account/usePasskeys';
import { useDisplayName, useProfile } from '@/features/account/useProfile';
import { useSession } from '@/features/session/useSession';
import { describeApiError } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';

export function OverviewPage() {
  const { t } = useTranslation();
  const { session, user, isLoading: sessionLoading, error: sessionError, refetch } = useSession();
  const { profile, isLoading: profileLoading, error: profileError } = useProfile();
  const { passkeys, isLoading: passkeysLoading } = usePasskeys();
  const displayName = useDisplayName();

  if (sessionLoading || profileLoading) {
    return <PageState kind="loading" minHeight="40vh" />;
  }

  const loadError = sessionError ?? profileError;
  if (!user || !profile || loadError) {
    return (
      <PageState
        kind="error"
        minHeight="40vh"
        description={describeApiError(loadError)}
        error={loadError}
        onRetry={refetch}
      />
    );
  }

  const methods = (session?.amr ?? [])
    .map((method: AuthenticationMethod) => t(`account.overview.amr.${method}`))
    .join(t('account.overview.methodSeparator'));

  const stepUpRequired = user.step_up_required;
  const email = profile.email || user.email;

  return (
    <Stack gap="lg" maw={760}>
      <AccountPageHeader
        title={t('account.overview.title')}
        subtitle={t('account.overview.subtitle')}
      />

      <Paper p={{ base: 'md', sm: 'lg' }}>
        <Group gap="lg" wrap="nowrap" align="center">
          <AccountAvatar size={64} radius="xl" />
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fz="lg" fw={600} lineClamp={1}>
              {displayName}
            </Text>
            <Text size="sm" c="dimmed" lineClamp={1}>
              @{profile.username}
            </Text>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" lineClamp={1}>
                {email || t('account.overview.noEmail')}
              </Text>
              {email && (
                <Badge size="sm" variant="light" color={profile.email_verified ? 'teal' : 'orange'}>
                  {profile.email_verified
                    ? t('account.overview.emailVerified')
                    : t('account.overview.emailUnverified')}
                </Badge>
              )}
              {profile.status !== 'active' && (
                <Badge size="sm" variant="light" color="red">
                  {t(`account.overview.status.${profile.status}`)}
                </Badge>
              )}
            </Group>
          </Stack>
        </Group>
      </Paper>

      <SectionCard
        title={t('account.overview.securityTitle')}
        action={
          <Button
            component={Link}
            to="/account/security"
            variant="light"
            size="xs"
            leftSection={<IconShieldCheck size={14} stroke={1.5} />}
          >
            {t('account.overview.manageSecurity')}
          </Button>
        }
      >
        {passkeysLoading ? (
          <Skeleton height={60} />
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing="md">
            <InfoItem label={t('account.overview.signInMethod')}>
              <Text size="sm">{methods || t('account.overview.unknown')}</Text>
            </InfoItem>
            <InfoItem label={t('account.overview.sessionExpires')}>
              <Text size="sm">
                {formatDateTime(session?.expires_at) ?? t('account.overview.unknown')}
              </Text>
            </InfoItem>
            <InfoItem label={t('account.overview.stepUp')}>
              <Badge size="sm" color={stepUpRequired ? 'teal' : 'red'} variant="light">
                {stepUpRequired ? t('common.enabled') : t('common.disabled')}
              </Badge>
            </InfoItem>
            <InfoItem label={t('account.overview.passkeys')}>
              <Text size="sm">
                {passkeys.length === 0
                  ? t('account.overview.noPasskey')
                  : t('account.overview.passkeyTotal', { total: passkeys.length })}
              </Text>
            </InfoItem>
          </SimpleGrid>
        )}

        {passkeys.length === 0 && !passkeysLoading && (
          <Alert color="blue" variant="light">
            <Stack gap={4}>
              <Text size="sm">{t('account.overview.passkeyRecommendation')}</Text>
              <Anchor component={Link} to="/account/security" size="sm">
                {t('account.overview.addPasskey')}
              </Anchor>
            </Stack>
          </Alert>
        )}
      </SectionCard>
    </Stack>
  );
}
