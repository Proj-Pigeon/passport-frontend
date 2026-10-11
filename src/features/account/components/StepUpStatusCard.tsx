import { Badge, Button, Group, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/AccountSections';
import { useCountdown } from '@/hooks/useCountdown';
import { useStepUp } from '@/features/step-up/useStepUp';
import { formatClock, secondsUntil } from '@/lib/format';
import { isWebAuthnSupported } from '@/lib/webauthn';

export function StepUpStatusCard() {
  const { t } = useTranslation();
  const { isActive, expiresAt, ensureStepUp } = useStepUp();
  const countdown = useCountdown();
  const { start } = countdown;
  const [pending, setPending] = useState(false);

  useEffect(() => {
    start(secondsUntil(expiresAt));
  }, [expiresAt, start]);

  const verify = async () => {
    setPending(true);
    try {
      await ensureStepUp({ force: true });
    } catch {
      // the modal already explained why verification did not complete
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard
      title={t('account.security.stepUpTitle')}
      description={t('account.security.stepUpDescription')}
      action={
        <Button
          size="xs"
          variant="light"
          onClick={() => void verify()}
          loading={pending}
          disabled={!isWebAuthnSupported()}
        >
          {t('account.security.stepUpVerify')}
        </Button>
      }
    >
      <Group gap="xs" wrap="wrap" align="center">
        <Badge size="sm" variant="light" color={isActive ? 'teal' : 'gray'}>
          {isActive ? t('account.security.stepUpActive') : t('account.security.stepUpInactive')}
        </Badge>
        <Text size="sm" c="dimmed">
          {isActive
            ? t('account.security.stepUpRemaining', { time: formatClock(countdown.remaining) })
            : t('account.security.stepUpInactiveHint')}
        </Text>
      </Group>
    </SectionCard>
  );
}
