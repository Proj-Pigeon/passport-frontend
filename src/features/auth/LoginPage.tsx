import { schemaResolver, useForm } from '@mantine/form';
import { Alert, Anchor, Button, Group, PasswordInput, Stack, TextInput } from '@mantine/core';
import { IconAt, IconLock } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import { getComplianceDocuments } from '@/api/endpoints/compliance';
import { loginWithPassword } from '@/api/endpoints/session';
import { isApiError } from '@/api/errors';
import { AuthLayout } from '@/components/AuthLayout';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { completeLogin } from '@/lib/loginReturn';
import { isTurnstileEnabled } from '@/lib/turnstile';
import { loginSchema } from '@/lib/validators';

import { FederationButtons } from './components/FederationButtons';
import { PasskeyLoginButton } from './components/PasskeyLoginButton';
import { SubmitErrorAlert } from './components/SubmitErrorAlert';
import { TurnstileField, type TurnstileFieldHandle } from './components/TurnstileField';
import { ComplianceConsent } from './components/ComplianceConsent';

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
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const documentsQuery = useQuery({
    queryKey: ['compliance-documents'],
    queryFn: ({ signal }) => getComplianceDocuments(signal),
    staleTime: 60_000,
  });

  const form = useForm({
    initialValues: { identifier: '', password: '' },
    validate: schemaResolver(loginSchema, { sync: true }),
  });

  const reauthRequired = searchParams.get('reauth') === 'required';

  const mutation = useMutation({
    mutationFn: (values: { identifier: string; password: string }) =>
      loginWithPassword({
        identifier: values.identifier.trim(),
        password: values.password,
        ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        compliance_versions: {
          terms: documentsQuery.data?.version ?? 0,
          privacy: documentsQuery.data?.version ?? 0,
          ...(documentsQuery.data?.cross_border_enabled
            ? { cross_border: documentsQuery.data.version }
            : {}),
        },
      }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.clear();
      completeLogin(searchParams.toString(), navigate);
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
    if (!consentChecked || !documentsQuery.data) {
      setConsentError(documentsQuery.data ? t('compliance.required') : t('compliance.loadError'));
      return;
    }
    setConsentError(null);
    if (isTurnstileEnabled() && !turnstileToken) {
      setTurnstileError(t('turnstile.required'));
      return;
    }
    setTurnstileError(null);
    mutation.mutate(values);
  });

  const apiError = isApiError(submitError) ? submitError : null;
  const emailNotVerified = apiError?.code === 'email_not_verified';
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
              message={
                emailNotVerified
                  ? t('auth.login.emailNotVerified')
                  : credentialFailure
                    ? t('auth.login.failed')
                    : undefined
              }
              hint={emailNotVerified ? t('auth.login.emailNotVerifiedHint') : undefined}
              color={apiError?.status === 429 ? 'orange' : emailNotVerified ? 'yellow' : 'red'}
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

            {documentsQuery.isError ? (
              <Alert color="red">{t('compliance.loadError')}</Alert>
            ) : documentsQuery.data ? (
              <ComplianceConsent
                documents={documentsQuery.data}
                checked={consentChecked}
                onChange={(checked) => {
                  setConsentChecked(checked);
                  if (checked) setConsentError(null);
                }}
                error={consentError}
                disabled={mutation.isPending}
              />
            ) : (
              <Alert color="blue">{t('compliance.loading')}</Alert>
            )}

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

        {documentsQuery.data && (
          <PasskeyLoginButton
            complianceVersions={{
              terms: documentsQuery.data.version,
              privacy: documentsQuery.data.version,
              ...(documentsQuery.data.cross_border_enabled
                ? { cross_border: documentsQuery.data.version }
                : {}),
            }}
            consented={consentChecked}
            onRequireConsent={() => setConsentError(t('compliance.required'))}
          />
        )}

        {!reauthRequired && documentsQuery.data && (
          <FederationButtons
            consented={consentChecked}
            complianceVersions={{
              terms: documentsQuery.data.version,
              privacy: documentsQuery.data.version,
              ...(documentsQuery.data.cross_border_enabled
                ? { cross_border: documentsQuery.data.version }
                : {}),
            }}
            onRequireConsent={() => setConsentError(t('compliance.required'))}
          />
        )}
      </>
    </AuthLayout>
  );
}
