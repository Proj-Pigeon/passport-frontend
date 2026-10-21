import { Box, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

import { BrandMark } from './BrandMark';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { LanguageSwitch } from './LanguageSwitch';

export interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  lead?: ReactNode;
  centered?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  headerRight?: ReactNode;
}

export function AuthLayout({
  title,
  subtitle,
  lead,
  centered = false,
  children,
  footer,
  maxWidth = 460,
  headerRight,
}: AuthLayoutProps) {
  useDocumentTitle(title);

  return (
    <Stack
      gap={0}
      mih="100dvh"
      bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))"
    >
      <Box
        component="header"
        py="md"
        px={{ base: 0, sm: 'lg' }}
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        bg="var(--mantine-color-body)"
      >
        <Container size="lg" fluid w="100%" maw={{ base: maxWidth, sm: 'none' }}>
          <Group justify="space-between" wrap="nowrap">
            <BrandMark to="/" size="md" />
            <Group gap="xs" wrap="nowrap">
              {headerRight}
              <LanguageSwitch />
              <ColorSchemeToggle />
            </Group>
          </Group>
        </Container>
      </Box>

      <Container
        component="main"
        flex={1}
        w="100%"
        maw={maxWidth}
        py="xl"
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <Stack w="100%" gap="lg">
          <Paper p={{ base: 'lg', sm: 'xl' }} radius="md" shadow="xs">
            <Stack gap="lg">
              <Stack gap={6} align={centered ? 'center' : undefined}>
                {lead}
                <Title order={1} fz={{ base: 22, sm: 26 }} ta={centered ? 'center' : undefined}>
                  {title}
                </Title>
                {subtitle && (
                  <Text size="sm" c="dimmed" ta={centered ? 'center' : undefined}>
                    {subtitle}
                  </Text>
                )}
              </Stack>
              {children}
            </Stack>
          </Paper>

          {footer && (
            <Box ta="center">
              <Text component="span" size="sm" c="dimmed">
                {footer}
              </Text>
            </Box>
          )}
        </Stack>
      </Container>
    </Stack>
  );
}
