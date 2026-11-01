import { ActionIcon, Badge, Box, Divider, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useModals } from '@mantine/modals';
import { IconPencil } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AccountPageHeader, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';

import { AvatarUploader } from './components/AvatarUploader';
import { ChangeEmailModal } from './components/ChangeEmailModal';
import { DisplayNameEditModal } from './components/DisplayNameEditModal';
import { LinkedIdentities } from './components/LinkedIdentities';
import { useProfile } from './useProfile';

interface ProfileInfoRowProps {
  label: string;
  editLabel: string;
  onEdit: () => void;
  editable?: boolean;
  hint?: string;
  badge?: ReactNode;
  children: ReactNode;
}

function ProfileInfoRow({
  label,
  editLabel,
  onEdit,
  editable = true,
  hint,
  badge,
  children,
}: ProfileInfoRowProps) {
  const icon = <IconPencil size={16} stroke={1.5} />;
  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="md">
      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text size="xs" c="dimmed" fw={500}>
          {label}
        </Text>
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          {children}
          {badge}
        </Group>
        {hint && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Stack>
      {editable ? (
        <Tooltip label={editLabel}>
          <ActionIcon aria-label={editLabel} variant="subtle" color="gray" onClick={onEdit}>
            {icon}
          </ActionIcon>
        </Tooltip>
      ) : (
        <Tooltip label={editLabel}>
          <Box style={{ display: 'inline-flex' }}>
            <ActionIcon aria-label={editLabel} variant="subtle" color="gray" disabled>
              {icon}
            </ActionIcon>
          </Box>
        </Tooltip>
      )}
    </Group>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const modals = useModals();
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

  const openDisplayNameModal = () => {
    let modalId = '';
    const close = () => modals.closeModal(modalId);
    modalId = modals.openModal({
      title: t('account.profile.displayName'),
      closeOnClickOutside: false,
      children: <DisplayNameEditModal close={close} />,
    });
  };

  const openEmailModal = () => {
    let modalId = '';
    const close = () => modals.closeModal(modalId);
    modalId = modals.openModal({
      title: t('account.security.changeEmailTitle'),
      closeOnClickOutside: false,
      children: <ChangeEmailModal close={close} />,
    });
  };

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
        <Stack gap="md">
          <ProfileInfoRow
            label={t('account.profile.displayName')}
            hint={t('account.profile.displayNameHint')}
            editLabel={t('account.profile.editDisplayName')}
            onEdit={openDisplayNameModal}
          >
            {profile.display_name?.trim() ? (
              <Text size="sm" lineClamp={1}>
                {profile.display_name.trim()}
              </Text>
            ) : (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {t('account.profile.displayNameFallback')}
              </Text>
            )}
          </ProfileInfoRow>

          <Divider />

          <ProfileInfoRow
            label={t('account.profile.username')}
            hint={t('account.profile.usernameLocked')}
            editLabel={t('account.profile.editUsername')}
            editable={false}
            onEdit={() => {}}
          >
            <Text size="sm">@{profile.username}</Text>
          </ProfileInfoRow>

          <Divider />

          <ProfileInfoRow
            label={t('account.profile.email')}
            editLabel={t('account.security.changeEmail')}
            onEdit={openEmailModal}
            badge={
              profile.email ? (
                <Badge size="sm" variant="light" color={profile.email_verified ? 'teal' : 'orange'}>
                  {profile.email_verified
                    ? t('account.overview.emailVerified')
                    : t('account.overview.emailUnverified')}
                </Badge>
              ) : undefined
            }
          >
            <Text size="sm" lineClamp={1}>
              {profile.email || t('account.overview.noEmail')}
            </Text>
          </ProfileInfoRow>
        </Stack>
      </SectionCard>

      <LinkedIdentities />
    </Stack>
  );
}
