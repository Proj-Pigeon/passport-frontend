import type { AdminResourceKind, AdminResourceView } from '@/api/endpoints/admin/types';

export interface ResourceSectionProps {
  resource: AdminResourceView;
  etag: string;
  refresh: () => Promise<void>;
  canWrite?: boolean;
}

export interface ResourceDetailContextValue extends ResourceSectionProps {
  kind: AdminResourceKind;
  resourceId: string;
  canApprove: boolean;
  approvable: boolean;
  rootType?: 'web' | 'spa' | 'native' | 'device' | 'saml';
  isDevice: boolean;
  parentApplication?: AdminResourceView | null;
  parentApplicationId: string | null;
  activationPending: boolean;
  activationBlocked: boolean;
  requestActivation: (action: 'activate' | 'deactivate') => void;
  configPending: boolean;
  configError: unknown;
  configSubmittedPending: boolean;
  saveConfig: (configuration: Record<string, unknown>) => void;
  decisionPending: boolean;
  decisionError: unknown;
  openDecision: (
    request: NonNullable<AdminResourceView['change_requests']>[number],
    decision: 'approve' | 'reject',
  ) => void;
}
