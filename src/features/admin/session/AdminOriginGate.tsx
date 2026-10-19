import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';

import { PageState } from '@/components/PageState';
import { openTopLevel } from '@/lib/topLevelNavigation';
import { crossOriginViewURL } from '@/lib/viewSwitch';

export function AdminOriginGate({ children }: { children: ReactNode }) {
  const redirectURL = useMemo(
    () => crossOriginViewURL('admin', `${window.location.pathname}${window.location.search}`),
    [],
  );
  useEffect(() => {
    if (redirectURL) {
      openTopLevel(redirectURL);
    }
  }, [redirectURL]);

  if (redirectURL) {
    return <PageState kind="loading" minHeight="60vh" />;
  }
  return children;
}
