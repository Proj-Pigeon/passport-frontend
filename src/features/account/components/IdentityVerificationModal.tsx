import { Button, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { IdentitySessionResponse, MyIdentityResponse } from '@/api/endpoints/account/identity';
import { describeApiError } from '@/i18n/errors';

import { DIDIT_ORIGIN, embeddedUrl, isMessageEnvelope } from './identityVerification';

export function IdentityVerificationModal({
  session,
  onClose,
  onRefresh,
}: {
  session: IdentitySessionResponse;
  onClose: () => void;
  onRefresh: (id: string) => Promise<MyIdentityResponse>;
}) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<unknown>(null);
  const refreshInFlight = useRef(false);
  const src = useMemo(() => embeddedUrl(session.session_url), [session.session_url]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== DIDIT_ORIGIN || event.source !== frameRef.current?.contentWindow) {
        return;
      }
      if (!isMessageEnvelope(event.data)) {
        return;
      }
      if (event.data.type === 'didit:completed') {
        if (refreshInFlight.current) return;
        refreshInFlight.current = true;
        setError(null);
        void onRefresh(session.id)
          .then(() => onClose())
          .catch(setError)
          .finally(() => {
            refreshInFlight.current = false;
          });
        return;
      }
      if (event.data.type === 'didit:cancelled' || event.data.type === 'didit:close_request') {
        onClose();
      }
      if (event.data.type === 'didit:error') {
        setError(new Error(t('account.identity.providerError')));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose, onRefresh, session.id, t]);

  return (
    <Stack gap="sm">
      {error !== null && (
        <Stack gap="xs">
          <Text c="red" size="sm">
            {describeApiError(error)}
          </Text>
          <Button variant="light" onClick={onClose}>
            {t('account.identity.closeAndWait')}
          </Button>
        </Stack>
      )}
      <iframe
        ref={frameRef}
        title={t('account.identity.iframeTitle')}
        src={src}
        allow="camera; microphone; geolocation; clipboard-write; fullscreen; autoplay; encrypted-media; digital-credentials-get"
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: 'min(620px, 65dvh)', border: 0 }}
      />
    </Stack>
  );
}
