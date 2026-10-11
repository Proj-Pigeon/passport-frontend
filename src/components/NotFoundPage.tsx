import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle('404');

  return (
    <Center mih="60vh" p="md">
      <Stack align="center" gap="sm">
        <Title order={1} fz={64} c="dimmed">
          404
        </Title>
        <Text size="lg">{t('notFound.title')}</Text>
        <Text c="dimmed" size="sm">
          {t('notFound.body')}
        </Text>
        <Button component={Link} to="/account" mt="md">
          {t('notFound.action')}
        </Button>
      </Stack>
    </Center>
  );
}
