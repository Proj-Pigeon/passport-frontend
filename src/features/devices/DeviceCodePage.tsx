import { Button, Stack, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { AuthLayout } from '@/components/AuthLayout';
import { normalizeDeviceCode } from '@/lib/deviceCode';

export function DeviceCodePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const paramCode = params.get('user_code') ?? '';
  const [input, setInput] = useState(paramCode);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const normalized = normalizeDeviceCode(paramCode);
    if (normalized.length === 8) {
      navigate(`/device/confirm?user_code=${encodeURIComponent(normalized)}`, { replace: true });
    }
  }, [paramCode, navigate]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeDeviceCode(input);
    if (normalized.length !== 8) {
      setInvalid(true);
      return;
    }
    navigate(`/device/confirm?user_code=${encodeURIComponent(normalized)}`);
  };

  return (
    <AuthLayout title={t('devices.authorizeTitle')} subtitle={t('devices.authorizeHint')}>
      <form onSubmit={submit}>
        <Stack gap="sm">
          <TextInput
            label={t('devices.code')}
            value={input}
            onChange={(event) => {
              setInput(event.currentTarget.value);
              setInvalid(false);
            }}
            placeholder="XXXX-XXXX"
            maxLength={32}
            required
            error={invalid ? t('devices.codeInvalid') : undefined}
            data-autofocus
          />
          <Button type="submit" variant="light" disabled={input.trim().length === 0}>
            {t('common.continue')}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
