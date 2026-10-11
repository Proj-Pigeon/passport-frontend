import { Alert, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { isApiError } from '@/api/errors';
import { RequestIdText } from '@/components/RequestIdText';
import { describeApiError } from '@/i18n/errors';

export interface SubmitErrorAlertProps {
  error: unknown;
  title?: string;
  message?: ReactNode;
  hint?: ReactNode;
  color?: string;
}

export function SubmitErrorAlert({
  error,
  title,
  message,
  hint,
  color = 'red',
}: SubmitErrorAlertProps) {
  const { t } = useTranslation();

  if (!error) {
    return null;
  }

  const requestId = isApiError(error) ? error.requestId : null;

  return (
    <Alert color={color} variant="light" role="alert" title={title ?? t('errors.title')}>
      <Stack gap={6}>
        <Text size="sm">{message ?? describeApiError(error)}</Text>
        {hint && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
        <RequestIdText requestId={requestId} />
      </Stack>
    </Alert>
  );
}
