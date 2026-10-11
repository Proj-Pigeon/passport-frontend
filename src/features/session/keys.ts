export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  passkeys: ['passkeys'] as const,
  interaction: (interactionId: string) => ['oauth', 'interaction', interactionId] as const,
};
