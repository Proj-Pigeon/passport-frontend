import { Code, CopyButton, Group, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export interface RequestIdTextProps {
  requestId: string | null | undefined;
}

export function RequestIdText({ requestId }: RequestIdTextProps) {
  const { t } = useTranslation();

  if (!requestId) {
    return null;
  }

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Text size="xs" c="dimmed">
        {t('common.requestId')}
      </Text>
      <CopyButton value={requestId}>
        {({ copy, copied }) => (
          <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
            <Group gap={4} wrap="nowrap" onClick={copy} style={{ cursor: 'pointer' }}>
              <Code>{requestId}</Code>
              {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
            </Group>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
