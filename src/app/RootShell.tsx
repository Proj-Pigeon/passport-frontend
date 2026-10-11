import { Outlet } from 'react-router';

import { UnauthorizedWatcher } from '@/features/session/UnauthorizedWatcher';

export function RootShell() {
  return (
    <>
      <UnauthorizedWatcher />
      <Outlet />
    </>
  );
}
