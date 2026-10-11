import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { isApiError } from '@/api/errors';
import { RequestIdText } from '@/components/RequestIdText';
import { queryKeys } from '@/features/session/keys';
import { describeApiError } from '@/i18n/errors';
import { isPasskeyCancelled, isWebAuthnSupported, stepUpWithPasskey } from '@/lib/webauthn';

export interface StepUpModalBodyProps {
  close: () => void;
  onVerified: () => void;
}

export function StepUpModalBody({ close, onVerified }: StepUpModalBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState(!isWebAuthnSupported());

  const mutation = useMutation({
    mutationFn: () => stepUpWithPasskey(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      onVerified();
    },
    onError: (cause) => {
      if (isPasskeyCancelled(cause)) {
        setError(null);
        return;
      }
      if (isApiError(cause) && cause.status === 403) {
        setBlocked(true);
        setError(null);
        return;
      }
      setError(cause);
    },
  });

  if (blocked) {
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

      {error != null && (
        <Alert color="red" variant="light" role="alert">
          <Stack gap={6}>
            <Text size="sm">{describeApiError(error)}</Text>
            <RequestIdText requestId={isApiError(error) ? error.requestId : null} />
          </Stack>
        </Alert>
      )}

      <Group justify="flex-end">
        <Button variant="subtle" onClick={close} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          {t('stepUp.verify')}
        </Button>
      </Group>
    </Stack>
  );
}
