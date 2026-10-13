import { Alert, Badge, Button, Divider, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLinkTransaction, deleteExternalIdentity } from '@/api/endpoints/federation';
import { isApiError } from '@/api/errors';
import { SectionCard } from '@/components/AccountSections';
import { FederationProviderIcon } from '@/components/FederationProviderIcon';
import { RequestIdText } from '@/components/RequestIdText';
import { isStepUpAborted, useStepUp } from '@/features/step-up/useStepUp';
import { describeApiError } from '@/i18n/errors';
import {
  linkedIdentitiesByProvider,
  useExternalIdentities,
  useFederationProviders,
  useInvalidateExternalIdentities,
  type FederationProvider,
  type LinkedIdentity,
} from '@/lib/federation';
import { openTopLevel } from '@/lib/topLevelNavigation';

export function LinkedIdentities() {
  const { t } = useTranslation();
  const { runWithStepUp } = useStepUp();
  const invalidateIdentities = useInvalidateExternalIdentities();
  const [error, setError] = useState<unknown>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const providers = useFederationProviders().data?.providers ?? [];
  const identities = useExternalIdentities().data?.identities ?? [];

  if (providers.length === 0) {
    return null;
  }

  const grouped = linkedIdentitiesByProvider(identities);

  const link = async (provider: FederationProvider) => {
    setError(null);
    setPendingKey(`bind:${provider.slug}`);
    try {
      const transaction = await runWithStepUp(() => createLinkTransaction(provider.slug));
      openTopLevel(transaction.continue_url);
    } catch (cause) {
      if (!isStepUpAborted(cause)) {
        setError(cause);
      }
    } finally {
      setPendingKey(null);
    }
  };

  const unlink = async (identity: LinkedIdentity) => {
    setError(null);
    setPendingKey(`unbind:${identity.id}`);
    try {
      await runWithStepUp(() => deleteExternalIdentity(identity.id));
      await invalidateIdentities();
      notifications.show({ color: 'teal', message: t('federation.link.unbindSuccess') });
    } catch (cause) {
      if (!isStepUpAborted(cause)) {
        setError(cause);
      }
    } finally {
      setPendingKey(null);
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
  const busy = pendingKey !== null;

  const rows: IdentityRowModel[] = providers.flatMap((provider): IdentityRowModel[] => {
    const bound = grouped.get(provider.slug) ?? [];
    return bound.length === 0
      ? [{ key: `provider:${provider.slug}`, provider, identity: null }]
      : bound.map((identity) => ({ key: `identity:${identity.id}`, provider, identity }));
  });

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

        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 && <Divider />}
            <IdentityRow
              provider={row.provider}
              identity={row.identity}
              pendingKey={pendingKey}
              busy={busy}
              onBind={(provider) => void link(provider)}
              onUnbind={(identity) => void unlink(identity)}
            />
          </Fragment>
        ))}
      </Stack>
    </SectionCard>
  );
}

interface IdentityRowModel {
  key: string;
  provider: FederationProvider;
  identity: LinkedIdentity | null;
}

interface IdentityRowProps {
  provider: FederationProvider;
  identity: LinkedIdentity | null;
  pendingKey: string | null;
  busy: boolean;
  onBind: (provider: FederationProvider) => void;
  onUnbind: (identity: LinkedIdentity) => void;
}

function IdentityRow({ provider, identity, pendingKey, busy, onBind, onUnbind }: IdentityRowProps) {
  const { t } = useTranslation();
  const actionKey = identity ? `unbind:${identity.id}` : `bind:${provider.slug}`;

  return (
    <Group justify="space-between" align="center" wrap="nowrap" py="sm" gap="sm">
      <Group gap="md" wrap="nowrap" flex={1} miw={0}>
        <ThemeIcon variant="light" size="lg">
          <FederationProviderIcon
            slug={provider.slug}
            providerType={provider.provider_type}
            size={20}
          />
        </ThemeIcon>
        <Stack gap={2} miw={0}>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" fw={500} lineClamp={1}>
              {provider.display_name}
            </Text>
            {identity && (
              <Badge size="xs" variant="light" color="teal">
                {t('federation.link.bound')}
              </Badge>
            )}
          </Group>
          {identity?.email_hint || identity?.display_name ? (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {identity.email_hint ?? identity.display_name}
            </Text>
          ) : null}
        </Stack>
      </Group>
      <Button
        variant="light"
        color={identity ? 'red' : undefined}
        size="xs"
        aria-label={t(identity ? 'federation.link.unbindName' : 'federation.link.bindName', {
          name: provider.display_name,
        })}
        loading={pendingKey === actionKey}
        disabled={busy && pendingKey !== actionKey}
        onClick={() => (identity ? onUnbind(identity) : onBind(provider))}
      >
        {t(identity ? 'federation.link.unbind' : 'federation.link.bind')}
      </Button>
    </Group>
  );
}
