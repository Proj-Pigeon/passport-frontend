import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';

import { confirmEmailVerification } from '@/api/endpoints/auth';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { RequestIdText } from '@/components/RequestIdText';
import { parseMailToken } from '@/lib/mailToken';

type VerifyState = 'verifying' | 'success' | 'invalid' | 'missing';

const TITLE_KEYS: Record<VerifyState, string> = {
  verifying: 'auth.verifyEmail.title',
  success: 'auth.verifyEmail.successTitle',
  invalid: 'auth.verifyEmail.invalidTitle',
  missing: 'auth.verifyEmail.missingTitle',
};

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);
  const [token] = useState(() => parseMailToken(location.search, location.hash));
  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'missing');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token || started.current) {
      return;
    }
    started.current = true;

    navigate('/verify-email', { replace: true });

    confirmEmailVerification(token)
      .then(() => setState('success'))
      .catch((cause: unknown) => {
        setError(cause);
        setState('invalid');
      });
  }, [token, navigate]);

  const requestId = isApiError(error) ? error.requestId : null;

  return (
    <AuthLayout title={t(TITLE_KEYS[state])}>
      {state === 'verifying' && (
        <Stack gap="md" align="center" py="lg">
          <Loader size="lg" />
          <Text size="sm" c="dimmed">
            {t('auth.verifyEmail.verifying')}
          </Text>
        </Stack>
      )}

      {state === 'success' && (
        <Stack gap="md">
          <Text size="sm">{t('auth.verifyEmail.successBody')}</Text>
          <Button component={Link} to="/login" fullWidth>
            {t('auth.verifyEmail.successAction')}
          </Button>
        </Stack>
      )}

      {state === 'invalid' && (
        <Stack gap="md">
          <Alert color="red" variant="light" role="alert">
            <Stack gap={6}>
              <Text size="sm">{t('auth.verifyEmail.invalidBody')}</Text>
              <RequestIdText requestId={requestId} />
            </Stack>
          </Alert>
          <Button component={Link} to="/login" variant="light" fullWidth>
            {t('auth.verifyEmail.invalidAction')}
          </Button>
        </Stack>
      )}

      {state === 'missing' && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t('auth.verifyEmail.missingBody')}
          </Text>
          <Button component={Link} to="/login" variant="light" fullWidth>
            {t('auth.verifyEmail.invalidAction')}
          </Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
