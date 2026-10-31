import type { AdminResourceKind, AdminResourceView } from '@/api/endpoints/admin/types';

export interface DeveloperSectionProps {
  resource: AdminResourceView;
  etag: string;
  refresh: () => Promise<void>;
  canWrite?: boolean;
}

export interface DeveloperDetailContextValue extends DeveloperSectionProps {
  kind: AdminResourceKind;
  resourceId: string;
  approvable: boolean;
  rootType?: 'web' | 'spa' | 'native' | 'device' | 'saml';
  isDevice: boolean;
  parentApplication?: AdminResourceView | null;
  parentApplicationId: string | null;
  requestActivation: (action: 'activate' | 'deactivate') => void;
  configPending: boolean;
  configError: unknown;
  saveConfig: (configuration: Record<string, unknown>) => void;
}
