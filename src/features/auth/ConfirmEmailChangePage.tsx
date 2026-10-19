import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';

import { confirmEmailChange } from '@/api/endpoints/auth';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { RequestIdText } from '@/components/RequestIdText';
import { queryKeys } from '@/features/session/keys';
import { parseMailToken } from '@/lib/mailToken';

type ConfirmState = 'confirming' | 'success' | 'invalid' | 'missing';

const TITLE_KEYS: Record<ConfirmState, string> = {
  confirming: 'auth.confirmEmailChange.title',
  success: 'auth.confirmEmailChange.successTitle',
  invalid: 'auth.confirmEmailChange.invalidTitle',
  missing: 'auth.confirmEmailChange.missingTitle',
};

export function ConfirmEmailChangePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [token] = useState(() => parseMailToken(location.search, location.hash));
  const [state, setState] = useState<ConfirmState>(token ? 'confirming' : 'missing');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token || started.current) {
      return;
    }
    started.current = true;

    navigate('/confirm-email-change', { replace: true });

    confirmEmailChange(token)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.profile });
        queryClient.invalidateQueries({ queryKey: queryKeys.session });
        setState('success');
      })
      .catch((cause: unknown) => {
        setError(cause);
        setState('invalid');
      });
  }, [token, navigate, queryClient]);

  const requestId = isApiError(error) ? error.requestId : null;

  return (
    <AuthLayout title={t(TITLE_KEYS[state])}>
      {state === 'confirming' && (
        <Stack gap="md" align="center" py="lg">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">
            {t('auth.confirmEmailChange.confirming')}
          </Text>
        </Stack>
      )}

      {state === 'success' && (
        <Stack gap="md">
          <Text size="sm">{t('auth.confirmEmailChange.successBody')}</Text>
          <Button component={Link} to="/account/security" fullWidth>
            {t('auth.confirmEmailChange.successAction')}
          </Button>
        </Stack>
      )}

      {state === 'invalid' && (
        <Stack gap="md">
          <Alert color="red" variant="light" role="alert">
            <Stack gap={6}>
              <Text size="sm">{t('auth.confirmEmailChange.invalidBody')}</Text>
              <RequestIdText requestId={requestId} />
            </Stack>
          </Alert>
          <Button component={Link} to="/account/security" variant="light" fullWidth>
            {t('auth.confirmEmailChange.invalidAction')}
          </Button>
        </Stack>
      )}

      {state === 'missing' && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t('auth.confirmEmailChange.missingBody')}
          </Text>
          <Button component={Link} to="/account/security" variant="light" fullWidth>
            {t('auth.confirmEmailChange.invalidAction')}
          </Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
