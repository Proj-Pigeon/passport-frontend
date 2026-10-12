import { Alert, Button, Divider, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLinkTransaction } from '@/api/endpoints/federation';
import { isApiError } from '@/api/errors';
import { SectionCard } from '@/components/AccountSections';
import { RequestIdText } from '@/components/RequestIdText';
import { isStepUpAborted, useStepUp } from '@/features/step-up/useStepUp';
import { describeApiError } from '@/i18n/errors';
import { listFederationProviders, type FederationProvider } from '@/lib/federation';
import { openTopLevel } from '@/lib/topLevelNavigation';

export function LinkedIdentities() {
  const { t } = useTranslation();
  const { runWithStepUp } = useStepUp();
  const [error, setError] = useState<unknown>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const providers = listFederationProviders();

  if (providers.length === 0) {
    return null;
  }

  const link = async (provider: FederationProvider) => {
    setError(null);
    setPendingSlug(provider.slug);
    try {
      const transaction = await runWithStepUp(() => createLinkTransaction(provider.slug));
      openTopLevel(transaction.continue_url);
    } catch (cause) {
      if (!isStepUpAborted(cause)) {
        setError(cause);
      }
    } finally {
      setPendingSlug(null);
    }
  };

  const errorNotice = () => {
    if (!isApiError(error)) {
      return error === null ? null : describeApiError(error);
    }
    if (error.status === 409) {
      return t('federation.link.conflict');
    }
    if (error.status === 404) {
      return t('federation.link.notConfigured');
    }
    return describeApiError(error);
  };

  const notice = errorNotice();

  return (
    <SectionCard title={t('federation.link.title')} description={t('federation.link.description')}>
      <Stack gap={0}>
        {notice !== null && (
          <Alert color="red" variant="light" role="alert">
            <Stack gap={6}>
              <Text size="sm">{notice}</Text>
              <RequestIdText requestId={isApiError(error) ? error.requestId : null} />
            </Stack>
          </Alert>
        )}

        {providers.map((provider, index) => (
          <div key={provider.slug}>
            {index > 0 && <Divider />}
            <Group justify="space-between" align="center" wrap="nowrap" py="sm" gap="sm">
              <Text size="sm" fw={500} lineClamp={1}>
                {provider.name}
              </Text>
              <Button
                variant="light"
                size="xs"
                aria-label={t('federation.link.bindName', { name: provider.name })}
                loading={pendingSlug === provider.slug}
                disabled={pendingSlug !== null && pendingSlug !== provider.slug}
                onClick={() => void link(provider)}
              >
                {t('federation.link.bind')}
              </Button>
            </Group>
          </div>
        ))}
      </Stack>
    </SectionCard>
  );
}
