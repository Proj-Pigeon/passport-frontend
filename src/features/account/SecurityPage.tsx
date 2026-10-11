import { Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { AccountPageHeader } from '@/components/AccountSections';

import { PasskeySection } from './components/PasskeySection';
import { StepUpStatusCard } from './components/StepUpStatusCard';

export function SecurityPage() {
  const { t } = useTranslation();

  return (
    <Stack gap="lg" maw={760}>
      <AccountPageHeader
        title={t('account.security.title')}
        subtitle={t('account.security.subtitle')}
      />
      <PasskeySection />
      <StepUpStatusCard />
    </Stack>
  );
}
