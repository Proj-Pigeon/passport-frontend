import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export interface AccountPageHeaderProps {
  title: string;
  subtitle?: ReactNode;
}

export function AccountPageHeader({ title, subtitle }: AccountPageHeaderProps) {
  useDocumentTitle(title);

  return (
    <Stack gap={2}>
      <Title order={1} fz={{ base: 20, sm: 24 }}>
        {title}
      </Title>
      {subtitle && (
        <Text size="sm" c="dimmed">
          {subtitle}
        </Text>
      )}
    </Stack>
  );
}

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" fw={500}>
        {label}
      </Text>
      {children}
    </Stack>
  );
}

export function SectionCard({ title, description, action, children }: SectionCardProps) {
  return (
    <Paper p={{ base: 'md', sm: 'lg' }}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Stack gap={2}>
            <Title order={2} fz={16} fw={600}>
              {title}
            </Title>
            {description && (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            )}
          </Stack>
          {action}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}
