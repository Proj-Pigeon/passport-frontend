import { ModalsProvider } from '@mantine/modals';
import { Outlet } from 'react-router';

import { UnauthorizedWatcher } from '@/features/session/UnauthorizedWatcher';

export function RootShell() {
  return (
    <ModalsProvider>
      <UnauthorizedWatcher />
      <Outlet />
    </ModalsProvider>
  );
}
