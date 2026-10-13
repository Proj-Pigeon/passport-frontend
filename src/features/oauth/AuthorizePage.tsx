import {
  Alert,
  Avatar,
  Button,
  Divider,
  Group,
  List,
  Loader,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconAt, IconFingerprint, IconKey, IconUser } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { approveInteraction, denyInteraction, getInteraction } from '@/api/endpoints/oauth';
import { isApiError, NETWORK_ERROR_CODE } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { RequestIdText } from '@/components/RequestIdText';
import { useLogout } from '@/features/session/useLogout';
import { queryKeys } from '@/features/session/keys';
import { useSession } from '@/features/session/useSession';
import { useCountdown } from '@/hooks/useCountdown';
import { describeApiError } from '@/i18n/errors';
import { formatClock, secondsUntil } from '@/lib/format';
import { locationToNext, withNextParam } from '@/lib/safeNext';
import { openTopLevel } from '@/lib/topLevelNavigation';

type DecisionChoice = 'approve' | 'deny';

const SCOPE_KEYS = new Set(['openid', 'profile', 'email']);
const SCOPE_ICONS = {
  openid: IconFingerprint,
  profile: IconUser,
  email: IconAt,
} as const;

export function AuthorizePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  const { user } = useSession();
  const [searchParams] = useSearchParams();
  const interactionId = searchParams.get('interaction') ?? '';

  const interactionQuery = useQuery({
    queryKey: queryKeys.interaction(interactionId),
    queryFn: ({ signal }) => getInteraction(interactionId, signal),
    enabled: interactionId !== '',
    retry: (failureCount, error) =>
      (!isApiError(error) || error.status !== 404) && failureCount < 1,
  });

  const countdown = useCountdown();
  const { start } = countdown;
  const interaction = interactionQuery.data ?? null;

  useEffect(() => {
    if (interaction) {
      start(secondsUntil(interaction.expires_at));
    }
  }, [interaction, start]);

  const [handled, setHandled] = useState(false);
  const [decisionError, setDecisionError] = useState<unknown>(null);

  const decision = useMutation({
    mutationFn: (choice: DecisionChoice) =>
      choice === 'approve' ? approveInteraction(interactionId) : denyInteraction(interactionId),
    onMutate: () => {
      setDecisionError(null);
    },
    onSuccess: (result) => {
      openTopLevel(result.continue_url);
    },
    onError: (error) => {
      if (isApiError(error) && (error.status === 404 || error.status === 409)) {
        setHandled(true);
        return;
      }
      setDecisionError(error);
    },
  });

  const expired = interaction !== null && secondsUntil(interaction.expires_at) <= 0;
  const deciding = decision.isPending;

  const switchAccount = () => {
    const next = locationToNext(location);
    logout.mutate(undefined, {
      onSettled: () => {
        navigate(next ? withNextParam('/login', next) : '/login', { replace: true });
      },
    });
  };

  if (interactionId === '') {
    return (
      <AuthLayout title={t('oauth.missingTitle')}>
        <Text size="sm" c="dimmed">
          {t('oauth.missingBody')}
        </Text>
      </AuthLayout>
    );
  }

  if (interactionQuery.isPending) {
    return (
      <AuthLayout title={t('oauth.title')}>
        <Stack gap="md" align="center" py="lg">
          <Loader size="lg" />
        </Stack>
      </AuthLayout>
    );
  }

  if (interactionQuery.isError) {
    const error = interactionQuery.error;
    if (isApiError(error) && error.status === 404) {
      return (
        <AuthLayout title={t('oauth.unavailableTitle')}>
          <Text size="sm" c="dimmed">
            {t('oauth.unavailableBody')}
          </Text>
        </AuthLayout>
      );
    }
    return (
      <AuthLayout title={t('oauth.loadFailedTitle')}>
        <Stack gap="md">
          <Alert color="red" variant="light" role="alert">
            <Stack gap={6}>
              <Text size="sm">{describeApiError(error)}</Text>
              <RequestIdText requestId={isApiError(error) ? error.requestId : null} />
            </Stack>
          </Alert>
          <Button variant="light" fullWidth onClick={() => interactionQuery.refetch()}>
            {t('common.retry')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  if (handled || interaction === null) {
    return (
      <AuthLayout title={t('oauth.handledTitle')}>
        <Text size="sm" c="dimmed">
          {t('oauth.handledBody')}
        </Text>
      </AuthLayout>
    );
  }

  const accountName = user?.display_name || user?.username || '';
  const ambiguousFailure = isApiError(decisionError) && decisionError.code === NETWORK_ERROR_CODE;

  return (
    <AuthLayout title={t('oauth.title')} subtitle={t('oauth.subtitle')}>
      <Stack gap="md">
        <Text size="sm">{t('oauth.requestedBy', { client: interaction.client_name })}</Text>

        <List spacing="xs" size="sm" center>
          {interaction.scopes.map((scope) => {
            const ScopeIcon = SCOPE_ICONS[scope as keyof typeof SCOPE_ICONS] ?? IconKey;
            return (
              <List.Item
                key={scope}
                icon={
                  <ThemeIcon size={26} radius="xl">
                    <ScopeIcon size={14} />
                  </ThemeIcon>
                }
              >
                {SCOPE_KEYS.has(scope)
                  ? t(`oauth.scopes.${scope}`)
                  : t('oauth.scopes.unknown', { scope })}
              </List.Item>
            );
          })}
        </List>

        <Divider label={t('oauth.accountLabel')} labelPosition="left" />
        <Group wrap="nowrap" align="center">
          <Avatar radius="xl">{accountName.slice(0, 1).toUpperCase()}</Avatar>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate="end">
              {accountName}
            </Text>
            {user?.email && (
              <Text size="xs" c="dimmed" truncate="end">
                {user.email}
              </Text>
            )}
          </Stack>
          <Button
            ml="auto"
            variant="subtle"
            size="compact-sm"
            onClick={switchAccount}
            loading={logout.isPending}
          >
            {t('oauth.switchAccount')}
          </Button>
        </Group>

        <Divider />
        <Text size="xs" c="dimmed">
          {t('oauth.expiresIn', { time: formatClock(countdown.remaining) })}
        </Text>

        {expired && (
          <Alert color="orange" variant="light" title={t('oauth.expiredTitle')}>
            {t('oauth.expiredBody')}
          </Alert>
        )}

        {decisionError !== null && (
          <Alert color="red" variant="light" role="alert">
            <Stack gap={6}>
              <Text size="sm">
                {ambiguousFailure ? t('oauth.decisionAmbiguous') : describeApiError(decisionError)}
              </Text>
              {!ambiguousFailure && (
                <RequestIdText
                  requestId={isApiError(decisionError) ? decisionError.requestId : null}
                />
              )}
            </Stack>
          </Alert>
        )}

        <Group grow>
          <Button
            variant="outline"
            color="red"
            disabled={expired || deciding}
            loading={deciding && decision.variables === 'deny'}
            onClick={() => decision.mutate('deny')}
          >
            {t('oauth.deny')}
          </Button>
          <Button
            disabled={expired || deciding}
            loading={deciding && decision.variables === 'approve'}
            onClick={() => decision.mutate('approve')}
          >
            {t('oauth.approve')}
          </Button>
        </Group>
      </Stack>
    </AuthLayout>
  );
}
