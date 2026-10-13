import { Badge, Divider, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { AccountPageHeader, InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';

import { AvatarUploader } from './components/AvatarUploader';
import { DisplayNameForm } from './components/DisplayNameForm';
import { LinkedIdentities } from './components/LinkedIdentities';
import { useProfile } from './useProfile';

export function ProfilePage() {
  const { t } = useTranslation();
  const { profile, isLoading, error, refetch } = useProfile();

  if (isLoading) {
    return <PageState kind="loading" minHeight="40vh" />;
  }

  if (!profile || error) {
    return (
      <PageState
        kind="error"
        minHeight="40vh"
        description={describeApiError(error)}
        error={error}
        onRetry={refetch}
      />
    );
  }

  return (
    <Stack gap="lg" maw={760}>
      <AccountPageHeader
        title={t('account.profile.title')}
        subtitle={t('account.profile.subtitle')}
      />

      <SectionCard
        title={t('account.profile.avatarTitle')}
        description={t('account.profile.avatarDescription')}
      >
        <AvatarUploader />
      </SectionCard>

      <SectionCard
        title={t('account.profile.basicTitle')}
        description={t('account.profile.basicDescription')}
      >
        <DisplayNameForm />

        <Divider />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing="md">
          <InfoItem label={t('account.profile.username')}>
            <Stack gap={2}>
              <Text size="sm">@{profile.username}</Text>
              <Text size="xs" c="dimmed">
                {t('account.profile.usernameLocked')}
              </Text>
            </Stack>
          </InfoItem>
          <InfoItem label={t('account.profile.email')}>
            <Stack gap={2}>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" lineClamp={1}>
                  {profile.email || t('account.overview.noEmail')}
                </Text>
                {profile.email && (
                  <Badge
                    size="sm"
                    variant="light"
                    color={profile.email_verified ? 'teal' : 'orange'}
                  >
                    {profile.email_verified
                      ? t('account.overview.emailVerified')
                      : t('account.overview.emailUnverified')}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {t('account.profile.emailLocked')}
              </Text>
            </Stack>
          </InfoItem>
        </SimpleGrid>
      </SectionCard>

      <LinkedIdentities />
    </Stack>
  );
}
