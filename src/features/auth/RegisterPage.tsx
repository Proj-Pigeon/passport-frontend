import {
  Alert,
  Anchor,
  Button,
  Group,
  List,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { IconLock, IconMail, IconUser } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { register } from '@/api/endpoints/auth';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { isTurnstileEnabled } from '@/lib/turnstile';
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizeUsername,
  registrationSchema,
} from '@/lib/validators';

import { PasswordStrength } from './components/PasswordStrength';
import { SubmitErrorAlert } from './components/SubmitErrorAlert';
import { TurnstileField, type TurnstileFieldHandle } from './components/TurnstileField';

interface RegistrationResult {
  email: string;
}

export function RegisterPage() {
  const { t } = useTranslation();
  const errorText = useFieldErrorText();
  const retryAfter = useRetryAfter();
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      username: '',
      email: '',
      password: '',
      display_name: '',
    },
    validate: schemaResolver(registrationSchema, { sync: true }),
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) => {
      const displayName = normalizeDisplayName(values.display_name);
      return register({
        username: normalizeUsername(values.username),
        email: normalizeEmail(values.email),
        password: values.password,
        ...(displayName ? { display_name: displayName } : {}),
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      });
    },
    onSuccess: (_data, values) => {
      setResult({ email: normalizeEmail(values.email) });
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

  if (result) {
    return (
      <AuthLayout title={t('auth.register.resultTitle')}>
        <Stack gap="md">
          <Text size="sm">{t('auth.register.resultBody', { email: result.email })}</Text>

          <Alert color="blue" variant="light">
            <List size="sm" spacing={4} listStyleType="none" center={false}>
              <List.Item>{t('auth.register.resultNote')}</List.Item>
              <List.Item>{t('auth.register.resultDuplicateNote')}</List.Item>
              <List.Item>{t('auth.register.resultMissing')}</List.Item>
            </List>
          </Alert>

          <Button component={Link} to="/login" variant="light" fullWidth>
            {t('auth.register.backToLogin')}
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.haveAccount')}{' '}
          <Anchor component={Link} to="/login" size="sm">
            {t('auth.register.goLogin')}
          </Anchor>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <SubmitErrorAlert
            error={submitError}
            color={isApiError(submitError) && submitError.status === 429 ? 'orange' : 'red'}
          />

          <TextInput
            {...form.getInputProps('username')}
            error={errorText(form.errors.username)}
            label={t('auth.register.username')}
            placeholder={t('auth.register.usernamePlaceholder')}
            description={t('validation.username.hint')}
            leftSection={<IconUser size={16} stroke={1.5} />}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={mutation.isPending}
            required
            onChange={(event) => {
              form.setFieldValue('username', normalizeUsername(event.currentTarget.value));
            }}
          />

          <TextInput
            {...form.getInputProps('email')}
            error={errorText(form.errors.email)}
            label={t('auth.register.email')}
            placeholder={t('auth.register.emailPlaceholder')}
            leftSection={<IconMail size={16} stroke={1.5} />}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={mutation.isPending}
            required
          />

          <Stack gap={6}>
            <PasswordInput
              {...form.getInputProps('password')}
              error={errorText(form.errors.password)}
              label={t('auth.register.password')}
              leftSection={<IconLock size={16} stroke={1.5} />}
              autoComplete="new-password"
              disabled={mutation.isPending}
              required
            />
            <PasswordStrength value={form.values.password} />
          </Stack>

          <TextInput
            {...form.getInputProps('display_name')}
            error={errorText(form.errors.display_name)}
            label={
              <Group gap={6} wrap="nowrap">
                <span>{t('auth.register.displayName')}</span>
                <Text component="span" size="xs" c="dimmed">
                  ({t('common.optional')})
                </Text>
              </Group>
            }
            placeholder={t('auth.register.displayNamePlaceholder')}
            autoComplete="nickname"
            maxLength={80}
            disabled={mutation.isPending}
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
                ? t('auth.register.submitting')
                : t('auth.register.submit')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
