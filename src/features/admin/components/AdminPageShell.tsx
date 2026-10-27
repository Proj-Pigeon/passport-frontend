import { Stack } from '@mantine/core';
import type { ReactNode } from 'react';

export function AdminPageContainer({
  children,
  maw = 1080,
}: {
  children: ReactNode;
  maw?: number;
}) {
  return (
    <Stack gap="lg" maw={maw} style={{ minWidth: 0 }}>
      {children}
    </Stack>
  );
}
