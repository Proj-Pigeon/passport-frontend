import { Alert, Button, Center, Code, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { NotFoundPage } from './NotFoundPage';

export function RouteErrorPage() {
  const error = useRouteError();

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
        <Alert color="red" icon={<IconAlertTriangle />} title="页面出错了">
          发生了意外错误，请刷新页面重试。
          {import.meta.env.DEV && (
            <Code block mt="sm">
              {message}
            </Code>
          )}
        </Alert>
        <Button variant="default" onClick={() => window.location.reload()}>
          刷新页面
        </Button>
      </Stack>
    </Center>
  );
}
