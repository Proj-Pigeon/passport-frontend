import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { decideDeviceAuthorization, getDeviceAuthorization } from '@/api/endpoints/devices';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import {
  ConsentBrandRow,
  ConsentDeveloperLine,
  ConsentScopeList,
  type ConsentApplication,
} from '@/components/ConsentBranding';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { isStepUpAborted } from '@/features/step-up/useStepUp';

import { useDeviceStepUp } from './useDeviceStepUp';

export function DeviceConsentPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const code = params.get('user_code') ?? '';
  const verification = useDeviceStepUp();
  const [result, setResult] = useState<'approved' | 'denied' | null>(null);
  const query = useQuery({
    queryKey: ['device-authorization', code],
    queryFn: ({ signal }) => getDeviceAuthorization(code, signal),
    enabled: code.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const mutation = useMutation({
    mutationFn: (approve: boolean) =>
      approve
        ? verification.run(() => decideDeviceAuthorization(code, true))
        : decideDeviceAuthorization(code, false),
    onSuccess: (_, approve) => setResult(approve ? 'approved' : 'denied'),
  });

  if (code.length === 0) {
    return (
      <AuthLayout title={t('devices.missingCodeTitle')}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t('devices.missingCodeBody')}
          </Text>
          <Button component={Link} to="/device" variant="light">
            {t('devices.backToCode')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  if (result !== null) {
    return (
      <AuthLayout title={t('devices.authorizeTitle')}>
        <Alert color={result === 'approved' ? 'teal' : 'gray'}>{t(`devices.${result}`)}</Alert>
      </AuthLayout>
    );
  }

  const expired = query.data !== undefined && Date.parse(query.data.expires_at) <= now;
  const invalid = isApiError(query.error) && query.error.status === 404;

  if (invalid || expired) {
    return (
      <AuthLayout title={t('devices.authorizeTitle')}>
        <Stack gap="sm">
          <Alert color="orange">{t('devices.expired')}</Alert>
          <Button component={Link} to="/device" variant="light">
            {t('devices.backToCode')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  if (query.isPending) {
    return (
      <AuthLayout title={t('devices.authorizeTitle')}>
        <Stack gap="md" align="center" py="lg">
          <Loader size="lg" />
        </Stack>
      </AuthLayout>
    );
  }

  if (query.isError || query.data === undefined) {
    return (
      <AuthLayout title={t('devices.authorizeTitle')}>
        <Stack gap="sm">
          <SubmitErrorAlert error={query.error} />
          <Button variant="light" onClick={() => query.refetch()}>
            {t('common.retry')}
          </Button>
          <Button component={Link} to="/device" variant="subtle">
            {t('devices.backToCode')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  const authorization = query.data;
  const application: ConsentApplication = {
    name: authorization.client_name,
    logoUrl: authorization.logo_url,
    developerName: authorization.developer_name,
    developerUrl: authorization.developer_url,
  };

  return (
    <AuthLayout
      title={t('oauth.authorizeTitle', { client: authorization.client_name })}
      subtitle={<ConsentDeveloperLine application={application} />}
      lead={<ConsentBrandRow application={application} />}
      centered
      maxWidth={560}
    >
      <Stack gap="md">
        <ConsentScopeList scopes={authorization.scopes} />

        <Alert color="orange">{t('devices.phishing')}</Alert>

        {!isStepUpAborted(mutation.error) && <SubmitErrorAlert error={mutation.error} />}

        <Group grow>
          <Button
            variant="default"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            {t('devices.deny')}
          </Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate(true)}>
            {t('devices.approve')}
          </Button>
        </Group>
      </Stack>
    </AuthLayout>
  );
}
