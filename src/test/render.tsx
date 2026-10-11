import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { routes } from '@/app/router';
import { theme } from '@/app/theme';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const { queryClient: providedClient, ...renderOptions } = options;
  const queryClient = providedClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MantineProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <Notifications />
          {children}
        </QueryClientProvider>
      </MantineProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}

export function renderRoute(
  initialEntries: string[],
  options: Omit<RenderWithProvidersOptions, 'wrapper'> = {},
) {
  const router = createMemoryRouter(routes, { initialEntries });
  const rendered = renderWithProviders(<RouterProvider router={router} />, options);
  return { ...rendered, router };
}
