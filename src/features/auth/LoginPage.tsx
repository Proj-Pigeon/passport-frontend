import { schemaResolver, useForm } from '@mantine/form';
import { Anchor, Button, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import { IconAt, IconLock } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import { loginWithPassword } from '@/api/endpoints/session';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { nextFromSearchParams } from '@/lib/safeNext';
import { isTurnstileEnabled } from '@/lib/turnstile';
import { loginSchema } from '@/lib/validators';

import { PasskeyLoginButton } from './components/PasskeyLoginButton';
import { SubmitErrorAlert } from './components/SubmitErrorAlert';
import { TurnstileField, type TurnstileFieldHandle } from './components/TurnstileField';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const errorText = useFieldErrorText();
  const retryAfter = useRetryAfter();
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const [submitError, setSubmitError] = useState<unknown>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { identifier: '', password: '' },
    validate: schemaResolver(loginSchema, { sync: true }),
  });

  const next = nextFromSearchParams(searchParams.toString());

  const mutation = useMutation({
    mutationFn: (values: { identifier: string; password: string }) =>
      loginWithPassword({
        identifier: values.identifier.trim(),
        password: values.password,
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.clear();
      navigate(next ?? '/account', { replace: true });
    },
    onError: (error) => {
      setSubmitError(error);
      retryAfter.arm(error);
      setTurnstileToken(null);
      setTurnstileError(null);
      turnstileRef.current?.reset();
      if (isApiError(error) && error.status === 422) {
        form.setErrors(fieldErrorsFromApiError(error));
      }
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    setSubmitError(null);
    if (isTurnstileEnabled() && !turnstileToken) {
      setTurnstileError(t('turnstile.required'));
      return;
    }
    setTurnstileError(null);
    mutation.mutate(values);
  });

  const apiError = isApiError(submitError) ? submitError : null;
  const credentialFailure = apiError?.status === 401;
  const rateLimited = retryAfter.running;
  const submitLabel = rateLimited
    ? t('auth.login.rateLimited', { seconds: retryAfter.remaining })
    : mutation.isPending
      ? t('auth.login.submitting')
      : t('auth.login.submit');

  return (
    <AuthLayout
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Anchor component={Link} to="/register" size="sm">
            {t('auth.login.createAccount')}
          </Anchor>
        </>
      }
    >
      <>
        <form onSubmit={handleSubmit} noValidate>
          <Stack gap="md">
            <SubmitErrorAlert
              error={submitError}
              message={credentialFailure ? t('auth.login.failed') : undefined}
              hint={credentialFailure ? t('auth.login.failedHint') : undefined}
              color={apiError?.status === 429 ? 'orange' : 'red'}
            />

            <TextInput
              {...form.getInputProps('identifier')}
              error={errorText(form.errors.identifier)}
              label={t('auth.login.identifier')}
              placeholder={t('auth.login.identifierPlaceholder')}
              leftSection={<IconAt size={16} stroke={1.5} />}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={mutation.isPending}
              required
            />

            <PasswordInput
              {...form.getInputProps('password')}
              error={errorText(form.errors.password)}
              label={t('auth.login.password')}
              leftSection={<IconLock size={16} stroke={1.5} />}
              autoComplete="current-password"
              disabled={mutation.isPending}
              required
            />

            <Group justify="flex-end">
              <Anchor component={Link} to="/forgot-password" size="sm">
                {t('auth.login.forgot')}
              </Anchor>
            </Group>

            <TurnstileField
              ref={turnstileRef}
              onTokenChange={(token) => {
                setTurnstileToken(token);
                if (token) {
                  setTurnstileError(null);
                }
              }}
              error={turnstileError}
            />

            <Button
              type="submit"
              size="md"
              fullWidth
              loading={mutation.isPending}
              disabled={rateLimited}
            >
              {submitLabel}
            </Button>
          </Stack>
        </form>

        <PasskeyLoginButton />
      </>
    </AuthLayout>
  );
}
