export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  passkeys: ['passkeys'] as const,
  developerApplications: ['developer', 'applications'] as const,
  developerPermissions: (id: string) => ['developer', 'applications', id, 'permissions'] as const,
  interaction: (interactionId: string) => ['oauth', 'interaction', interactionId] as const,
};
