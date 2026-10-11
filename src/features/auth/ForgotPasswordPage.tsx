import { Alert, Anchor, Button, Stack, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { IconMail } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { requestPasswordReset } from '@/api/endpoints/recovery';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { isTurnstileEnabled } from '@/lib/turnstile';
import { forgotPasswordSchema, normalizeEmail } from '@/lib/validators';

import { SubmitErrorAlert } from './components/SubmitErrorAlert';
import { TurnstileField, type TurnstileFieldHandle } from './components/TurnstileField';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const errorText = useFieldErrorText();
  const retryAfter = useRetryAfter();
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { email: '' },
    validate: schemaResolver(forgotPasswordSchema, { sync: true }),
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      requestPasswordReset({
        email: normalizeEmail(values.email),
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      }),
    onSuccess: () => setSent(true),
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

  if (sent) {
    return (
      <AuthLayout title={t('auth.forgotPassword.resultTitle')}>
        <Stack gap="md">
          <Text size="sm">{t('auth.forgotPassword.resultBody')}</Text>

          <Alert color="blue" variant="light">
            <Text size="sm">{t('auth.forgotPassword.resultNote')}</Text>
          </Alert>

          <Button component={Link} to="/login" variant="light" fullWidth>
            {t('auth.forgotPassword.backToLogin')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.forgotPassword.title')}
      subtitle={t('auth.forgotPassword.subtitle')}
      footer={
        <Anchor component={Link} to="/login" size="sm">
          {t('auth.forgotPassword.backToLogin')}
        </Anchor>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <SubmitErrorAlert
            error={submitError}
            color={isApiError(submitError) && submitError.status === 429 ? 'orange' : 'red'}
          />

          <TextInput
            {...form.getInputProps('email')}
            error={errorText(form.errors.email)}
            label={t('auth.forgotPassword.email')}
            placeholder={t('auth.forgotPassword.emailPlaceholder')}
            leftSection={<IconMail size={16} stroke={1.5} />}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={mutation.isPending}
            required
          />

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
            disabled={retryAfter.running}
          >
            {retryAfter.running
              ? t('auth.login.rateLimited', { seconds: retryAfter.remaining })
              : mutation.isPending
                ? t('auth.forgotPassword.submitting')
                : t('auth.forgotPassword.submit')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
