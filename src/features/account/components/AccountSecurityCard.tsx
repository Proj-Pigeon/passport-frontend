import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Switch,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useModals } from '@mantine/modals';
import { IconLock, IconMail, IconMailForward, IconShieldCheck } from '@tabler/icons-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/AccountSections';
import { useProfile, useUpdateStepUpPreference } from '@/features/account/useProfile';
import { useSession } from '@/features/session/useSession';

import { ChangeEmailModal } from './ChangeEmailModal';
import { ChangePasswordModal } from './ChangePasswordModal';

export function AccountSecurityCard() {
  const { t } = useTranslation();
  const modals = useModals();
  const { user } = useSession();
  const { profile } = useProfile();
  const updatePreference = useUpdateStepUpPreference();

  const email = profile?.email ?? user?.email ?? '';
  const verified = profile?.email_verified ?? user?.email_verified ?? false;
  const stepUpEnabled = user?.step_up_required ?? true;

  const openPasswordModal = () => {
    let modalId = '';
    const close = () => modals.closeModal(modalId);
    modalId = modals.openModal({
      title: t('account.security.changePasswordTitle'),
      closeOnClickOutside: false,
      children: <ChangePasswordModal close={close} />,
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

  const disableStepUp = () => {
    modals.openConfirmModal({
      title: t('account.security.stepUpDisableTitle'),
      children: (
        <Alert color="red" variant="light">
          {t('account.security.stepUpDisableBody')}
        </Alert>
      ),
      labels: {
        confirm: t('account.security.stepUpDisableConfirm'),
        cancel: t('common.cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => updatePreference.mutate(false),
    });
  };

  const rows: { key: string; element: ReactNode }[] = [];

  if (user?.has_password !== false) {
    rows.push({
      key: 'password',
      element: (
        <Group justify="space-between" align="center" wrap="nowrap" py="sm" gap="sm">
          <Group gap="md" wrap="nowrap" flex={1} miw={0}>
            <ThemeIcon variant="light" size="lg">
              <IconLock size={20} stroke={1.5} />
            </ThemeIcon>
            <Stack gap={2} miw={0}>
              <Text size="sm" fw={500} lineClamp={1}>
                {t('account.security.passwordTitle')}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {t('account.security.passwordDescription')}
              </Text>
            </Stack>
          </Group>
          <Button variant="light" size="xs" onClick={openPasswordModal}>
            {t('account.security.changePassword')}
          </Button>
        </Group>
      ),
    });
  }

  rows.push({
    key: 'email',
    element: (
      <Box py="sm">
        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
          <Group gap="md" wrap="nowrap" flex={1} miw={0}>
            <ThemeIcon variant="light" size="lg">
              <IconMail size={20} stroke={1.5} />
            </ThemeIcon>
            <Stack gap={2} miw={0}>
              <Group gap="sm" wrap="nowrap">
                <Text size="sm" fw={500} lineClamp={1}>
                  {t('account.security.emailTitle')}
                </Text>
                {email && (
                  <Badge size="xs" variant="light" color={verified ? 'teal' : 'orange'}>
                    {verified
                      ? t('account.overview.emailVerified')
                      : t('account.overview.emailUnverified')}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {email || t('account.overview.noEmail')}
              </Text>
            </Stack>
          </Group>
          <Button variant="light" size="xs" onClick={openEmailModal}>
            {t('account.security.changeEmail')}
          </Button>
        </Group>

        {profile?.pending_email && (
          <Alert
            color="blue"
            variant="light"
            mt="xs"
            icon={<IconMailForward size={16} stroke={1.5} />}
          >
            <Text size="sm">
              {t('account.security.emailPending', { email: profile.pending_email })}
            </Text>
          </Alert>
        )}
      </Box>
    ),
  });

  rows.push({
    key: 'step-up',
    element: (
      <Group justify="space-between" align="center" wrap="nowrap" py="sm" gap="sm">
        <Group gap="md" wrap="nowrap" flex={1} miw={0}>
          <ThemeIcon variant="light" size="lg">
            <IconShieldCheck size={20} stroke={1.5} />
          </ThemeIcon>
          <Stack gap={2} miw={0}>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" fw={500} lineClamp={1}>
                {t('account.security.stepUpTitle')}
              </Text>
              <Badge size="xs" variant="light" color={stepUpEnabled ? 'teal' : 'red'}>
                {stepUpEnabled ? t('common.enabled') : t('common.disabled')}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {t('account.security.stepUpDescription')}
            </Text>
          </Stack>
        </Group>
        <Switch
          size="sm"
          aria-label={t('account.security.stepUpTitle')}
          checked={stepUpEnabled}
          disabled={updatePreference.isPending}
          onChange={(event) =>
            event.currentTarget.checked ? updatePreference.mutate(true) : disableStepUp()
          }
        />
      </Group>
    ),
  });

  return (
    <SectionCard
      title={t('account.security.accountSecurityTitle')}
      description={t('account.security.accountSecurityDescription')}
    >
      <Stack gap={0}>
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 && <Divider />}
            {row.element}
          </Fragment>
        ))}
      </Stack>
    </SectionCard>
  );
}
