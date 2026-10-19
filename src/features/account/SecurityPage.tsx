import { Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { AccountPageHeader } from '@/components/AccountSections';

import { DevicesCard } from '@/features/devices/DevicesCard';
import { AccountSecurityCard } from './components/AccountSecurityCard';
import { PasskeySection } from './components/PasskeySection';

export function SecurityPage() {
  const { t } = useTranslation();

  return (
    <Stack gap="lg" maw={760}>
      <AccountPageHeader
        title={t('account.security.title')}
        subtitle={t('account.security.subtitle')}
      />
      <AccountSecurityCard />
      <PasskeySection />
      <DevicesCard />
    </Stack>
  );
}
