import { Badge, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconHammer } from '@tabler/icons-react';
import { useLocation } from 'react-router';

export interface PlaceholderPageProps {
  title: string;
  milestone: string;
  description?: string;
}

export function PlaceholderPage({ title, milestone, description }: PlaceholderPageProps) {
  const location = useLocation();

  return (
    <Paper p="xl" maw={560} mx="auto" mt="xl">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Title order={2}>{title}</Title>
          <Badge leftSection={<IconHammer size={12} />} variant="light">
            {milestone}
          </Badge>
        </Group>
        {description && <Text c="dimmed">{description}</Text>}
        <Text size="sm" c="dimmed">
          当前路径：<Code>{location.pathname + location.search}</Code>
        </Text>
      </Stack>
    </Paper>
  );
}
