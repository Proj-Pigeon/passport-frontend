import { Button, PasswordInput, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { passwordDeviceStepUp } from '@/api/endpoints/devices';
import { isApiError } from '@/api/errors';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';

export function PasswordVerification({ verified }: { verified: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => passwordDeviceStepUp(password),
    onSuccess: verified,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Stack>
        <PasswordInput
          label={t('devices.password')}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          data-autofocus
          disabled={mutation.isPending}
        />
        {isApiError(mutation.error) && mutation.error.status === 400 ? (
          <Text c="red" role="alert">
            {t('devices.passwordWrong')}
          </Text>
        ) : (
          <SubmitErrorAlert error={mutation.error} />
        )}
        <Button type="submit" loading={mutation.isPending}>
          {t('devices.verify')}
        </Button>
      </Stack>
    </form>
  );
}
