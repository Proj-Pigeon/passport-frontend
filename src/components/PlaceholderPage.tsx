import { Badge, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconHammer } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export interface PlaceholderPageProps {
  titleKey: string;
  milestone: string;
  descriptionKey?: string;
}

export function PlaceholderPage({ titleKey, milestone, descriptionKey }: PlaceholderPageProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const title = t(titleKey);
  useDocumentTitle(title);

  return (
    <Paper p="xl" maw={560} mx="auto" mt="xl">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Title order={2}>{title}</Title>
          <Badge leftSection={<IconHammer size={12} />} variant="light">
            {milestone}
          </Badge>
        </Group>
        {descriptionKey && <Text c="dimmed">{t(descriptionKey)}</Text>}
        <Group gap={6} wrap="nowrap">
          <Text size="sm" c="dimmed">
            {t('placeholder.currentPath')}
          </Text>
          <Code>{location.pathname + location.search}</Code>
        </Group>
      </Stack>
    </Paper>
  );
}
