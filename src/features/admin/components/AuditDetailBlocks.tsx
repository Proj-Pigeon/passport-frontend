import { Badge, Box, Code, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import type { AdminHttpAccess } from '@/api/endpoints/admin/types';

import { statusColor } from '../statusColor';

function prettyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function JsonBlock({
  label,
  body,
  mediaType,
  truncated,
}: {
  label: string;
  body: string | null;
  mediaType: string | null;
  truncated: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {mediaType ?? '—'}
        </Text>
      </Group>
      {body === null ? (
        <Text size="sm" c="dimmed">
          —
        </Text>
      ) : (
        <Box mah={280} style={{ overflow: 'auto' }}>
          <Code block>{prettyBody(body)}</Code>
        </Box>
      )}
      {truncated && (
        <Text size="xs" c="orange">
          {t('admin.audit.truncated')}
        </Text>
      )}
    </Stack>
  );
}

export function HttpDetailSection({ http }: { http: AdminHttpAccess }) {
  const { t } = useTranslation();
  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="wrap">
        <Badge color={statusColor(http.status_code)} variant="light">
          {http.status_code}
        </Badge>
        <Text size="sm" ff="monospace" fw={500}>
          {http.method}
        </Text>
        <Text size="sm" ff="monospace" style={{ wordBreak: 'break-all' }}>
          {http.route}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        {t('admin.audit.fieldDuration')}: {http.duration_ms} ms
      </Text>
      <JsonBlock
        label={t('admin.audit.requestBody')}
        body={http.request_body}
        mediaType={http.request_media_type}
        truncated={http.request_truncated}
      />
      <JsonBlock
        label={t('admin.audit.responseBody')}
        body={http.response_body}
        mediaType={http.response_media_type}
        truncated={http.response_truncated}
      />
    </Stack>
  );
}
