import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { isApiError } from '@/api/errors';
import { RequestIdText } from '@/components/RequestIdText';
import { describeApiError } from '@/i18n/errors';
import { adminStepUpWithPasskey, isPasskeyCancelled, isWebAuthnSupported } from '@/lib/webauthn';

import { adminKeys } from '../keys';

export interface AdminStepUpModalBodyProps {
  close: () => void;
  onVerified: () => void;
}

export function AdminStepUpModalBody({ close, onVerified }: AdminStepUpModalBodyProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [blocked, setBlocked] = useState(!isWebAuthnSupported());

  const mutation = useMutation({
    mutationFn: () => adminStepUpWithPasskey(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.session });
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
        <Text size="sm">{t('admin.stepUp.blocked')}</Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={close}>
            {t('common.close')}
          </Button>
          <Button component={Link} to="/account/security" onClick={close}>
            {t('admin.stepUp.goAddPasskey')}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('admin.stepUp.body')}
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
          {t('admin.stepUp.verify')}
        </Button>
      </Group>
    </Stack>
  );
}
