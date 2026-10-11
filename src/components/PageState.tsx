import { Alert, Button, Center, Group, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type PageStateKind = 'loading' | 'error' | 'empty';

export interface PageStateProps {
  kind: PageStateKind;
  title?: string;
  description?: ReactNode;
  error?: unknown;
  onRetry?: () => void;
  action?: ReactNode;
  minHeight?: number | string;
}

export function PageState({
  kind,
  title,
  description,
  error,
  onRetry,
  action,
  minHeight = '40vh',
}: PageStateProps) {
  const { t } = useTranslation();

  if (kind === 'loading') {
    return (
      <Center mih={minHeight}>
        <Stack align="center" gap="sm">
          <Loader />
          <Text size="sm" c="dimmed">
            {title ?? t('state.loading')}
          </Text>
        </Stack>
      </Center>
    );
  }

  if (kind === 'error') {
    return (
      <Center mih={minHeight} p="md">
        <Stack maw={480} w="100%" gap="md">
          <Alert color="red" icon={<IconAlertTriangle />} title={title ?? t('state.errorTitle')}>
            {description ?? t('errors.generic')}
          </Alert>
          {error instanceof Error && error.message.length > 0 && (
            <Text size="xs" c="dimmed">
              {error.message}
            </Text>
          )}
          <Group>
            {onRetry && <Button onClick={onRetry}>{t('state.retry')}</Button>}
            {action}
          </Group>
        </Stack>
      </Center>
    );
  }

  return (
    <Center mih={minHeight} p="md">
      <Stack align="center" gap="sm" maw={420}>
        <IconInbox size={32} color="var(--mantine-color-dimmed)" stroke={1.5} />
        <Text fw={500}>{title ?? t('state.empty')}</Text>
        {description && (
          <Text size="sm" c="dimmed" ta="center">
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Center>
  );
}
