import { Alert, Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { decideDeviceAuthorization, getDeviceAuthorization } from '@/api/endpoints/devices';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { isStepUpAborted } from '@/features/step-up/useStepUp';
import { formatDateTime } from '@/lib/format';
import { useDeviceStepUp } from './useDeviceStepUp';

export function DevicePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [input, setInput] = useState(params.get('user_code') ?? '');
  const [code, setCode] = useState(params.get('user_code') ?? '');
  const [result, setResult] = useState<'approved' | 'denied' | null>(null);
  const verification = useDeviceStepUp();
  const query = useQuery({
    queryKey: ['device-authorization', code],
    queryFn: ({ signal }) => getDeviceAuthorization(code, signal),
    enabled: code.length > 0 && result === null,
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
  const expired = query.data && Date.parse(query.data.expires_at) <= now;
  const invalid = isApiError(query.error) && query.error.status === 404;
  return (
    <AuthLayout
      title={t('devices.authorizeTitle')}
      subtitle={t('devices.authorizeHint')}
      maxWidth={540}
    >
      {result ? (
        <Alert color={result === 'approved' ? 'teal' : 'gray'}>{t(`devices.${result}`)}</Alert>
      ) : (
        <Stack>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setCode(input.trim().toUpperCase());
              mutation.reset();
              if (code === input.trim().toUpperCase()) void query.refetch();
            }}
          >
            <Stack gap="sm">
              <TextInput
                label={t('devices.code')}
                value={input}
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder="XXXX-XXXX"
                maxLength={32}
                required
                disabled={mutation.isPending}
              />
              <Button
                type="submit"
                variant="light"
                loading={query.isFetching}
                disabled={mutation.isPending}
              >
                {t('devices.lookup')}
              </Button>
            </Stack>
          </form>
          {invalid || expired ? (
            <Alert color="orange">{t('devices.expired')}</Alert>
          ) : (
            <SubmitErrorAlert error={query.error} />
          )}
          {query.data && !expired && !query.isError && (
            <Stack gap="sm">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                {query.data.client_name}
              </Text>
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                {query.data.device_name} · {query.data.platform}
              </Text>
              <Text size="sm">
                {t('devices.expires', { time: formatDateTime(query.data.expires_at) })}
              </Text>
              <Group gap="xs">
                {query.data.scopes.map((scope) => (
                  <Badge key={scope} variant="light">
                    {scope}
                  </Badge>
                ))}
              </Group>
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
          )}
        </Stack>
      )}
    </AuthLayout>
  );
}
