import { Alert, Anchor, Button, Divider, PasswordInput, Stack, TextInput } from '@mantine/core';
import { IconAt, IconKey, IconLock } from '@tabler/icons-react';
import { schemaResolver, useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import { adminPasswordLogin } from '@/api/endpoints/admin/session';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import {
  TurnstileField,
  type TurnstileFieldHandle,
} from '@/features/auth/components/TurnstileField';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { adminLoginWithPasskey, isPasskeyCancelled, isWebAuthnSupported } from '@/lib/webauthn';
import { isTurnstileEnabled } from '@/lib/turnstile';
import { nextFromSearchParams } from '@/lib/safeNext';
import { loginSchema } from '@/lib/validators';
import type { z } from 'zod';

import { ADMIN_QUERY_ROOT } from './keys';

type AdminLoginForm = z.infer<typeof loginSchema>;

export function AdminLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const errorText = useFieldErrorText();
  const retryAfter = useRetryAfter();
  const turnstileRef = useRef<TurnstileFieldHandle>(null);

  const [submitError, setSubmitError] = useState<unknown>(null);
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const form = useForm<AdminLoginForm>({
    initialValues: { identifier: '', password: '' },
    validate: schemaResolver(loginSchema, { sync: true }),
  });

  const next = nextFromSearchParams(searchParams.toString());

  const settleSuccess = () => {
    resetCsrfToken('admin');
    queryClient.removeQueries({ queryKey: ADMIN_QUERY_ROOT });
    navigate(next ?? '/admin', { replace: true });
  };

  const passwordMutation = useMutation({
    mutationFn: (values: AdminLoginForm) =>
      adminPasswordLogin({
        identifier: values.identifier.trim(),
        password: values.password,
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      }),
    onSuccess: settleSuccess,
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

  const passkeyMutation = useMutation({
    mutationFn: (identifier: string) => adminLoginWithPasskey(identifier),
    onSuccess: settleSuccess,
    onError: (error) => {
      if (isPasskeyCancelled(error)) {
        return;
      }
      setSubmitError(error);
      retryAfter.arm(error);
    },
  });

  const handleSubmit = form.onSubmit((values) => {
    setSubmitError(null);
    setPasskeyNotice(null);
    if (isTurnstileEnabled() && !turnstileToken) {
      setTurnstileError(t('turnstile.required'));
      return;
    }
    setTurnstileError(null);
    passwordMutation.mutate(values);
  });

  const handlePasskey = () => {
    setSubmitError(null);
    const identifier = form.values.identifier.trim();
    if (identifier.length === 0) {
      setPasskeyNotice(t('admin.login.passkeyNeedsIdentifier'));
      return;
    }
    setPasskeyNotice(null);
    passkeyMutation.mutate(identifier);
  };

  const apiError = isApiError(submitError) ? submitError : null;
  const credentialFailure = apiError?.status === 401;
  const rateLimited = retryAfter.running;
  const pending = passwordMutation.isPending || passkeyMutation.isPending;
  const submitLabel = rateLimited
    ? t('auth.login.rateLimited', { seconds: retryAfter.remaining })
    : pending
      ? t('auth.login.submitting')
      : t('admin.login.submit');

  return (
    <AuthLayout
      title={t('admin.login.title')}
      subtitle={t('admin.login.subtitle')}
      headerRight={
        <Anchor component={Link} to="/account" size="sm" fw={500}>
          {t('admin.switchToUserView')}
        </Anchor>
      }
      footer={t('admin.login.footer')}
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <SubmitErrorAlert
            error={submitError}
            message={credentialFailure ? t('admin.login.failed') : undefined}
            hint={credentialFailure ? t('admin.login.failedHint') : undefined}
            color={apiError?.status === 429 ? 'orange' : 'red'}
          />

          <TextInput
            {...form.getInputProps('identifier')}
            error={errorText(form.errors.identifier)}
            label={t('admin.login.identifier')}
            placeholder={t('auth.login.identifierPlaceholder')}
            leftSection={<IconAt size={16} stroke={1.5} />}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={pending}
            required
          />

          <PasswordInput
            {...form.getInputProps('password')}
            error={errorText(form.errors.password)}
            label={t('auth.login.password')}
            leftSection={<IconLock size={16} stroke={1.5} />}
            autoComplete="current-password"
            disabled={pending}
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
            loading={passwordMutation.isPending}
            disabled={rateLimited || passkeyMutation.isPending}
          >
            {submitLabel}
          </Button>
        </Stack>
      </form>

      {isWebAuthnSupported() && (
        <>
          <Divider label={t('admin.login.passkeyDivider')} labelPosition="center" c="dimmed" />
          <Stack gap="xs">
            {passkeyNotice && (
              <Alert color="yellow" variant="light">
                {passkeyNotice}
              </Alert>
            )}
            <Button
              variant="default"
              size="md"
              fullWidth
              leftSection={<IconKey size={16} stroke={1.5} />}
              onClick={handlePasskey}
              disabled={rateLimited}
              loading={passkeyMutation.isPending}
            >
              {t('admin.login.passkey')}
            </Button>
          </Stack>
        </>
      )}
    </AuthLayout>
  );
}
