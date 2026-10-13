import { Button, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import { getCurrentSession } from '@/api/endpoints/session';
import { AuthLayout } from '@/components/AuthLayout';
import { queryKeys } from '@/features/session/keys';
import { completeLogin } from '@/lib/loginReturn';

type CompletePhase = 'processing' | 'failed';

export function FederationCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const result = searchParams.get('result');
  const [phase, setPhase] = useState<CompletePhase>(
    result === 'success' || result === 'link_success' ? 'processing' : 'failed',
  );

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    if (result === 'success') {
      getCurrentSession()
        .then(() => {
          resetCsrfToken();
          queryClient.clear();
          completeLogin(searchParams.toString(), navigate, true);
        })
        .catch(() => {
          setPhase('failed');
        });
      return;
    }

    if (result === 'link_success') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      notifications.show({ color: 'teal', message: t('federation.link.success') });
      navigate('/account/profile', { replace: true });
    }
  }, [result, searchParams, navigate, queryClient, t]);

  if (phase === 'processing') {
    return (
      <AuthLayout title={t('federation.complete.processingTitle')}>
        <Stack gap="md" align="center" py="lg">
          <Loader size="lg" />
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('federation.complete.failedTitle')}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('federation.complete.failedBody')}
        </Text>
        <Button component={Link} to="/login" variant="light" fullWidth>
          {t('federation.complete.backToLogin')}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
