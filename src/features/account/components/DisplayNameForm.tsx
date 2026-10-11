import { Button, Group, Stack, TextInput } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';

import { isApiError } from '@/api/errors';
import { useProfile, useUpdateDisplayName } from '@/features/account/useProfile';
import { fieldErrorsFromApiError, useFieldErrorText } from '@/i18n/errors';
import { normalizeDisplayName, profileSchema } from '@/lib/validators';

export function DisplayNameForm() {
  const { t } = useTranslation();
  const errorText = useFieldErrorText();
  const { profile } = useProfile();
  const mutation = useUpdateDisplayName();

  const savedName = profile?.display_name ?? '';

  const form = useForm({
    initialValues: { display_name: savedName },
    validate: schemaResolver(profileSchema, { sync: true }),
  });

  const dirty = normalizeDisplayName(form.values.display_name) !== normalizeDisplayName(savedName);

  const handleSubmit = form.onSubmit((values) => {
    mutation.mutate(normalizeDisplayName(values.display_name), {
      onError: (error) => {
        if (isApiError(error) && error.status === 422) {
          form.setErrors(fieldErrorsFromApiError(error));
        }
      },
    });
  });

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="md">
        <TextInput
          {...form.getInputProps('display_name')}
          error={errorText(form.errors.display_name)}
          label={t('account.profile.displayName')}
          description={t('account.profile.displayNameHint')}
          placeholder={t('account.profile.displayNamePlaceholder')}
          autoComplete="nickname"
          maxLength={80}
          disabled={mutation.isPending}
        />
        <Group justify="flex-end">
          <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
