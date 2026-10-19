import { Alert, Button, Group, PasswordInput, Stack, Tabs, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { stepUpWithPassword } from '@/api/endpoints/session';
import { isApiError } from '@/api/errors';
import { RequestIdText } from '@/components/RequestIdText';
import { queryKeys } from '@/features/session/keys';
import { useSession } from '@/features/session/useSession';
import { describeApiError } from '@/i18n/errors';
import { isPasskeyCancelled, isWebAuthnSupported, stepUpWithPasskey } from '@/lib/webauthn';

export type StepUpMethod = 'passkey' | 'password';

export interface StepUpModalBodyProps {
  close: () => void;
  onVerified: () => void;
  initialMethod?: StepUpMethod;
}

export function StepUpModalBody({ close, onVerified, initialMethod }: StepUpModalBodyProps) {
  const { t } = useTranslation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canUsePasskey = isWebAuthnSupported() && (user === null || user.has_passkey === true);
  const canUsePassword = user === null || user.has_password === true;
  const [method, setMethod] = useState<StepUpMethod>(() => {
    if (initialMethod === 'password' && canUsePassword) {
      return 'password';
    }
    if (initialMethod === 'passkey' && canUsePasskey) {
      return 'passkey';
    }
    return canUsePasskey ? 'passkey' : 'password';
  });
  const [passkeyError, setPasskeyError] = useState<unknown>(null);
  const [passkeyUnavailable, setPasskeyUnavailable] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<unknown>(null);
  const activeMethod: StepUpMethod =
    method === 'passkey' && canUsePasskey
      ? 'passkey'
      : method === 'password' && canUsePassword
        ? 'password'
        : canUsePasskey
          ? 'passkey'
          : 'password';

  const complete = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session });
    onVerified();
  };

  const passkeyMutation = useMutation({
    mutationFn: () => stepUpWithPasskey(),
    onSuccess: complete,
    onError: (cause) => {
      if (isPasskeyCancelled(cause)) {
        setPasskeyError(null);
        return;
      }
      if (isApiError(cause) && cause.status === 403) {
        setPasskeyError(null);
        setPasskeyUnavailable(true);
        if (canUsePassword) {
          setMethod('password');
        }
        return;
      }
      setPasskeyError(cause);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => stepUpWithPassword(password),
    onSuccess: complete,
    onError: setPasswordError,
  });

  if ((!canUsePasskey && !canUsePassword) || (passkeyUnavailable && !canUsePassword)) {
    return (
      <Stack gap="md">
        <Text size="sm">{t('stepUp.blocked')}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={close}>
            {t('common.close')}
          </Button>
          <Button component={Link} to="/account/security" onClick={close}>
            {t('stepUp.goToSecurity')}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('stepUp.body')}
      </Text>

      {passkeyUnavailable && canUsePassword && (
        <Alert color="yellow" variant="light">
          {t('stepUp.passkeyUnavailable')}
        </Alert>
      )}

      <Tabs
        value={activeMethod}
        onChange={(value) => {
          if (value === 'passkey' || value === 'password') {
            setMethod(value);
          }
        }}
      >
        <Tabs.List grow>
          {canUsePasskey && <Tabs.Tab value="passkey">{t('stepUp.methods.passkey')}</Tabs.Tab>}
          {canUsePassword && <Tabs.Tab value="password">{t('stepUp.methods.password')}</Tabs.Tab>}
        </Tabs.List>

        {canUsePasskey && (
          <Tabs.Panel value="passkey" pt="md">
            <Stack gap="md">
              {passkeyError != null && <StepUpError error={passkeyError} />}
              <Group justify="flex-end">
                <Button
                  variant="subtle"
                  onClick={close}
                  disabled={passkeyMutation.isPending || passwordMutation.isPending}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => passkeyMutation.mutate()}
                  loading={passkeyMutation.isPending}
                  disabled={passwordMutation.isPending}
                >
                  {t('stepUp.verify')}
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
        )}

        {canUsePassword && (
          <Tabs.Panel value="password" pt="md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPasswordError(null);
                passwordMutation.mutate();
              }}
            >
              <Stack gap="md">
                <PasswordInput
                  label={t('stepUp.password')}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                  data-autofocus
                  disabled={passwordMutation.isPending || passkeyMutation.isPending}
                />
                {isApiError(passwordError) && passwordError.status === 400 ? (
                  <Text c="red" role="alert">
                    {t('stepUp.passwordWrong')}
                  </Text>
                ) : (
                  passwordError != null && <StepUpError error={passwordError} />
                )}
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    onClick={close}
                    disabled={passwordMutation.isPending || passkeyMutation.isPending}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    loading={passwordMutation.isPending}
                    disabled={passkeyMutation.isPending}
                  >
                    {t('stepUp.verifyPassword')}
                  </Button>
                </Group>
              </Stack>
            </form>
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}

function StepUpError({ error }: { error: unknown }) {
  return (
    <Alert color="red" variant="light" role="alert">
      <Stack gap={6}>
        <Text size="sm">{describeApiError(error)}</Text>
        <RequestIdText requestId={isApiError(error) ? error.requestId : null} />
      </Stack>
    </Alert>
  );
}
