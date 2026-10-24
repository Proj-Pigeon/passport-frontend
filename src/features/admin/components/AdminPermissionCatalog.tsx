import { PermissionCatalog } from '@/features/permissions/PermissionCatalog';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

export function AdminPermissionCatalog({ applicationId }: { applicationId: string }) {
  const { data: session } = useAdminSession();
  const { runWithAdminStepUp } = useAdminStepUp();
  return (
    <PermissionCatalog
      scope="admin"
      applicationId={applicationId}
      canWrite={hasAdminCapability(session, 'applications:write')}
      runProtected={runWithAdminStepUp}
    />
  );
}
