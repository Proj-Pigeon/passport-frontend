import type { DeveloperOverviewRange } from '@/api/endpoints/developer/resources';

export const DEVELOPER_QUERY_ROOT = ['developer-panel'] as const;

export const developerPanelKeys = {
  all: DEVELOPER_QUERY_ROOT,
  overview: (range: DeveloperOverviewRange) => ['developer-panel', 'overview', range] as const,
  resourceKind: (kind: string) => ['developer-panel', 'resources', kind] as const,
  resourceList: (kind: string, params: Record<string, unknown>) =>
    ['developer-panel', 'resources', kind, 'list', params] as const,
  resource: (kind: string, resourceId: string) =>
    ['developer-panel', 'resources', kind, 'detail', resourceId] as const,
  applicationLogo: (resourceId: string) =>
    ['developer-panel', 'resources', 'application', resourceId, 'logo'] as const,
  protocolInfo: ['developer-panel', 'protocolInfo'] as const,
};
