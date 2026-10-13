import { Alert, Button, CopyButton, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { AdminSecretResult } from '@/api/endpoints/admin/types';

export function SecretRevealModal({
  opened,
  onClose,
  secret,
}: {
  opened: boolean;
  onClose: () => void;
  secret: AdminSecretResult | null;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('admin.secret.title')}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      withinPortal
    >
      <Stack gap="sm">
        <Alert color="red" variant="light">
          <Text size="sm" fw={500}>
            {t('admin.secret.warning')}
          </Text>
        </Alert>
        {secret && (
          <Stack gap="xs">
            <TextInput
              label={t('admin.secret.valueLabel')}
              value={secret.client_secret}
              readOnly
              ff="monospace"
              rightSection={
                <CopyButton value={secret.client_secret} timeout={4000}>
                  {({ copied, copy }) => (
                    <Button
                      size="compact-xs"
                      variant={copied ? 'filled' : 'light'}
                      leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                      onClick={copy}
                    >
                      {copied ? t('common.copied') : t('common.copy')}
                    </Button>
                  )}
                </CopyButton>
              }
            />
            <Text size="xs" c="dimmed">
              {t('admin.secret.meta', {
                version: secret.secret_version,
                overlap: secret.overlap_seconds,
              })}
            </Text>
          </Stack>
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>{t('admin.secret.acknowledge')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
