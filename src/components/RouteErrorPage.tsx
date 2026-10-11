import { Alert, Button, Center, Code, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { NotFoundPage } from './NotFoundPage';

export function RouteErrorPage() {
  const error = useRouteError();
  const { t } = useTranslation();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <Center mih="60vh" p="md">
      <Stack maw={480} w="100%">
        <Alert color="red" icon={<IconAlertTriangle />} title={t('errorBoundary.title')}>
          {t('errorBoundary.body')}
        </Alert>
        {import.meta.env.DEV && (
          <Code block mt="sm">
            {message}
          </Code>
        )}
        <Button variant="default" onClick={() => window.location.reload()}>
          {t('errorBoundary.action')}
        </Button>
      </Stack>
    </Center>
  );
}
