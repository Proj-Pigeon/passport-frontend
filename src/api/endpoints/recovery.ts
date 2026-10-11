import { apiPost, apiVoid } from '../http';
import type { PasswordResetInput, RecoveryRequestInput, RecoveryRequestResponse } from '../types';

export function requestPasswordReset(input: RecoveryRequestInput) {
  return apiPost<RecoveryRequestResponse>('/v1/recovery/password', input);
}

export function resetPassword(input: PasswordResetInput) {
  return apiVoid('/v1/recovery/password/reset', { method: 'POST', body: input });
}
