import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Alert, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { env } from '@/lib/env';

export type TurnstileStatus = 'idle' | 'solved' | 'expired' | 'error' | 'unsupported';

export interface TurnstileFieldHandle {
  reset: () => void;
  getResponse: () => string | undefined;
}

export interface TurnstileFieldProps {
  ref?: Ref<TurnstileFieldHandle>;
  onTokenChange: (token: string | null) => void;
  onStatusChange?: (status: TurnstileStatus) => void;
  error?: ReactNode;
}

export function TurnstileField({ ref, onTokenChange, onStatusChange, error }: TurnstileFieldProps) {
  const { t, i18n } = useTranslation();
  const widget = useRef<TurnstileInstance | undefined>(undefined);
  const [status, setStatus] = useState<TurnstileStatus>('idle');

  useImperativeHandle(
    ref,
    () => ({
      reset: () => widget.current?.reset(),
      getResponse: () => widget.current?.getResponse(),
    }),
    [],
  );

  const siteKey = env.turnstileSiteKey;
  if (!siteKey) {
    return null;
  }

  const updateStatus = (next: TurnstileStatus) => {
    setStatus(next);
    onStatusChange?.(next);
  };

  return (
    <Stack gap={6}>
      <Turnstile
        ref={widget}
        siteKey={siteKey}
        options={{
          size: 'flexible',
          theme: 'auto',
          language: i18n.language,
          appearance: 'always',
          retry: 'auto',
          refreshExpired: 'auto',
          action: env.turnstileAction,
        }}
        onSuccess={(token) => {
          onTokenChange(token);
          updateStatus('solved');
        }}
        onExpire={() => {
          onTokenChange(null);
          updateStatus('expired');
        }}
        onError={() => {
          onTokenChange(null);
          updateStatus('error');
        }}
        onUnsupported={() => {
          onTokenChange(null);
          updateStatus('unsupported');
        }}
      />

      {status === 'unsupported' && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
          <Text size="xs">{t('turnstile.unavailable')}</Text>
        </Alert>
      )}

      {error && (
        <Text size="xs" c="var(--mantine-color-error)" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  );
}
