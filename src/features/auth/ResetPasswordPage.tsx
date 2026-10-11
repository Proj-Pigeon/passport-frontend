import { Alert, Anchor, Button, Group, PasswordInput, Stack, Text } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { IconLock } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';

import { resetPassword } from '@/api/endpoints/recovery';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { parseMailToken } from '@/lib/mailToken';
import { resetPasswordSchema } from '@/lib/validators';

import { PasswordStrength } from './components/PasswordStrength';
import { SubmitErrorAlert } from './components/SubmitErrorAlert';

type ResetState = 'form' | 'invalid' | 'success';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const errorText = useFieldErrorText();
  const retryAfter = useRetryAfter();
  const cleared = useRef(false);

  const [token] = useState(() => parseMailToken(location.search, location.hash));
  const [state, setState] = useState<ResetState>('form');
  const [submitError, setSubmitError] = useState<unknown>(null);

  const form = useForm({
    initialValues: { password: '', confirmPassword: '' },
    validate: schemaResolver(resetPasswordSchema, { sync: true }),
  });

  useEffect(() => {
    if (!token || cleared.current) {
      return;
    }
    cleared.current = true;
    navigate('/reset-password', { replace: true });
  }, [token, navigate]);

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      resetPassword({ token: token ?? '', password: values.password }),
    onSuccess: () => setState('success'),
    onError: (error) => {
      retryAfter.arm(error);
      if (isApiError(error) && error.status === 400) {
        setSubmitError(null);
        setState('invalid');
        return;
      }
      setSubmitError(error);
      if (isApiError(error) && error.status === 422) {
        form.setErrors(fieldErrorsFromApiError(error));
      }
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    setSubmitError(null);
    mutation.mutate(values);
  });

  if (state === 'success') {
    return (
      <AuthLayout title={t('auth.resetPassword.successTitle')}>
        <Stack gap="md">
          <Text size="sm">{t('auth.resetPassword.successBody')}</Text>
          <Button component={Link} to="/login" fullWidth>
            {t('auth.resetPassword.successAction')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  if (state === 'invalid' || !token) {
    return (
      <AuthLayout title={t('auth.resetPassword.invalidTitle')}>
        <Stack gap="md">
          <Alert color="red" variant="light" role="alert">
            <Text size="sm">{t('auth.resetPassword.invalidBody')}</Text>
          </Alert>
          <Button component={Link} to="/forgot-password" variant="light" fullWidth>
            {t('auth.resetPassword.invalidAction')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.resetPassword.title')} subtitle={t('auth.resetPassword.subtitle')}>
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <SubmitErrorAlert
            error={submitError}
            color={isApiError(submitError) && submitError.status === 429 ? 'orange' : 'red'}
          />

          <Stack gap={6}>
            <PasswordInput
              {...form.getInputProps('password')}
              error={errorText(form.errors.password)}
              label={t('auth.resetPassword.password')}
              leftSection={<IconLock size={16} stroke={1.5} />}
              autoComplete="new-password"
              disabled={mutation.isPending}
              required
              autoFocus
            />
            <PasswordStrength value={form.values.password} />
          </Stack>

          <PasswordInput
            {...form.getInputProps('confirmPassword')}
            error={errorText(form.errors.confirmPassword)}
            label={t('auth.resetPassword.confirmPassword')}
            leftSection={<IconLock size={16} stroke={1.5} />}
            autoComplete="new-password"
            disabled={mutation.isPending}
            required
          />

          <Button
            type="submit"
            size="md"
            fullWidth
            loading={mutation.isPending}
            disabled={retryAfter.running}
          >
            {retryAfter.running
              ? t('auth.login.rateLimited', { seconds: retryAfter.remaining })
              : mutation.isPending
                ? t('auth.resetPassword.submitting')
                : t('auth.resetPassword.submit')}
          </Button>

          <Group justify="center">
            <Anchor component={Link} to="/login" size="sm">
              {t('auth.forgotPassword.backToLogin')}
            </Anchor>
          </Group>
        </Stack>
      </form>
    </AuthLayout>
  );
}
