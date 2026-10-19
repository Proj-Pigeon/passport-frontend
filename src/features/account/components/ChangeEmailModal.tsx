import { Button, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { requestEmailChange } from '@/api/endpoints/me';
import { isApiError } from '@/api/errors';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { queryKeys } from '@/features/session/keys';
import { isStepUpAborted } from '@/features/step-up/useStepUp';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { emailChangePasskeySchema, emailChangePasswordSchema } from '@/lib/validators';

import { useSensitiveAction } from '../useSensitiveAction';

export interface ChangeEmailModalProps {
  close: () => void;
}

export function ChangeEmailModal({ close }: ChangeEmailModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useFieldErrorText();
  const { requiresPasskey, requiresPassword, runSensitive } = useSensitiveAction();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const form = useForm({
    initialValues: { new_email: '', current_password: '' },
    validate: schemaResolver(
      requiresPassword ? emailChangePasswordSchema : emailChangePasskeySchema,
      { sync: true },
    ),
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      requestEmailChange({
        new_email: values.new_email,
        ...(requiresPassword ? { current_password: values.current_password } : {}),
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
        const fieldErrors = fieldErrorsFromApiError(error);
        if (Object.keys(fieldErrors).length > 0) {
          form.setErrors(fieldErrors);
          return;
        }
      }
      setSubmitError(error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    notifications.show({
      color: 'teal',
      message: t('account.security.emailChangeSent', {
        email: values.new_email.trim().toLowerCase(),
      }),
    });
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

        <TextInput
          {...form.getInputProps('new_email')}
          error={errorText(form.errors.new_email)}
          label={t('account.security.newEmail')}
          description={t('account.security.changeEmailHint')}
          type="email"
          autoComplete="email"
          disabled={mutation.isPending}
          required
          data-autofocus
        />

        {requiresPassword && (
          <PasswordInput
            {...form.getInputProps('current_password')}
            error={errorText(form.errors.current_password)}
            label={t('account.security.currentPassword')}
            autoComplete="current-password"
            disabled={mutation.isPending}
            required
          />
        )}

        <SubmitErrorAlert error={submitError} />

        <Group justify="flex-end">
          <Button variant="subtle" onClick={close} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {t('account.security.sendEmailChange')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
