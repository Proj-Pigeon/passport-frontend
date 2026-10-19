import { Button, Group, PasswordInput, Stack, Text } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { changePassword } from '@/api/endpoints/me';
import { isApiError } from '@/api/errors';
import { PasswordStrength } from '@/features/auth/components/PasswordStrength';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { isStepUpAborted } from '@/features/step-up/useStepUp';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { changePasswordSchema } from '@/lib/validators';

import { useSensitiveAction } from '../useSensitiveAction';

export interface ChangePasswordModalProps {
  close: () => void;
}

export function ChangePasswordModal({ close }: ChangePasswordModalProps) {
  const { t } = useTranslation();
  const errorText = useFieldErrorText();
  const { requiresPasskey, runSensitive } = useSensitiveAction();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const form = useForm({
    initialValues: { current_password: '', new_password: '', confirm_password: '' },
    validate: schemaResolver(changePasswordSchema, { sync: true }),
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      }),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitError(null);
    try {
      await runSensitive(() => mutation.mutateAsync(values));
    } catch (error) {
      if (isStepUpAborted(error)) {
        return;
      }
      if (isApiError(error) && error.status === 422) {
        form.setErrors(fieldErrorsFromApiError(error));
        return;
      }
      setSubmitError(error);
      return;
    }
    notifications.show({ color: 'teal', message: t('account.security.passwordChanged') });
    close();
  });

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {requiresPasskey
            ? t('account.security.verifyPasskeyHint')
            : t('account.security.verifyPasswordHint')}
        </Text>

        <PasswordInput
          {...form.getInputProps('current_password')}
          error={errorText(form.errors.current_password)}
          label={t('account.security.currentPassword')}
          autoComplete="current-password"
          disabled={mutation.isPending}
          required
          data-autofocus
        />

        <Stack gap={6}>
          <PasswordInput
            {...form.getInputProps('new_password')}
            error={errorText(form.errors.new_password)}
            label={t('account.security.newPassword')}
            autoComplete="new-password"
            disabled={mutation.isPending}
            required
          />
          <PasswordStrength value={form.values.new_password} />
        </Stack>

        <PasswordInput
          {...form.getInputProps('confirm_password')}
          error={errorText(form.errors.confirm_password)}
          label={t('account.security.confirmNewPassword')}
          autoComplete="new-password"
          disabled={mutation.isPending}
          required
        />

        <SubmitErrorAlert error={submitError} />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={close} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {t('account.security.savePassword')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
