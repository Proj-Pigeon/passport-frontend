export const ADMIN_QUERY_ROOT = ['admin'] as const;

export const adminKeys = {
  all: ADMIN_QUERY_ROOT,
  session: ['admin', 'session'] as const,
  users: ['admin', 'users'] as const,
  userList: (params: Record<string, unknown>) => ['admin', 'users', 'list', params] as const,
  user: (userId: string) => ['admin', 'users', 'detail', userId] as const,
  resourceKind: (kind: string) => ['admin', 'resources', kind] as const,
  resourceList: (kind: string, params: Record<string, unknown>) =>
    ['admin', 'resources', kind, 'list', params] as const,
  resource: (kind: string, resourceId: string) =>
    ['admin', 'resources', kind, 'detail', resourceId] as const,
  auditList: (params: Record<string, unknown>) => ['admin', 'audit', params] as const,
  configurationVersionList: (params: Record<string, unknown>) =>
    ['admin', 'configurationVersions', params] as const,
  configurationVersion: (configurationId: string) =>
    ['admin', 'configurationVersions', 'detail', configurationId] as const,
  keyRotation: (rotationId: string) => ['admin', 'keyRotations', rotationId] as const,
  backupExerciseList: (params: Record<string, unknown>) =>
    ['admin', 'backupExercises', params] as const,
  federationPresets: ['admin', 'federationPresets'] as const,
  protocolInfo: ['admin', 'protocolInfo'] as const,
};
