import { Button, Stack } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { resetCsrfToken } from '@/api/csrf';
import type { ComplianceVersions } from '@/api/types';
import { useRetryAfter } from '@/hooks/useRetryAfter';
import { completeLogin } from '@/lib/loginReturn';
import { isPasskeyCancelled, isWebAuthnSupported, loginWithPasskey } from '@/lib/webauthn';

import { SubmitErrorAlert } from './SubmitErrorAlert';

export function PasskeyLoginButton({ complianceVersions, consented, onRequireConsent }: { complianceVersions: ComplianceVersions; consented: boolean; onRequireConsent: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const retryAfter = useRetryAfter();
  const [error, setError] = useState<unknown>(null);

  const supported = isWebAuthnSupported();

  const mutation = useMutation({
    mutationFn: () => loginWithPasskey(complianceVersions),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.clear();
      completeLogin(searchParams.toString(), navigate);
    },
    onError: (cause) => {
      if (isPasskeyCancelled(cause)) {
        return;
      }
      setError(cause);
      retryAfter.arm(cause);
    },
  });

  if (!supported) {
    return null;
  }

  return (
    <Stack gap="sm">
      <SubmitErrorAlert error={error} />
      <Button
        type="button"
        variant="default"
        size="md"
        fullWidth
        onClick={() => {
          if (!consented) {
            onRequireConsent();
            return;
          }
          setError(null);
          mutation.mutate();
        }}
        loading={mutation.isPending}
        disabled={retryAfter.running}
        leftSection={<IconKey size={16} stroke={1.5} />}
      >
        {retryAfter.running
          ? t('auth.login.rateLimited', { seconds: retryAfter.remaining })
          : t('auth.login.passkey')}
      </Button>
    </Stack>
  );
}
