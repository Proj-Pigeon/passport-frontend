import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';

import { ErrorBoundary } from '@/components/ErrorBoundary';

import { queryClient } from './queryClient';
import { createAppRouter } from './router';
import { theme } from './theme';

const router = createAppRouter();

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <Notifications position="top-right" />
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
