import { apiGet, apiPost, apiVoid } from '../http';
import type { CsrfTokenResponse, RegistrationRequest, RegistrationResponse } from '../types';

export function fetchCsrfToken() {
  return apiGet<CsrfTokenResponse>('/v1/auth/csrf', { skipCsrf: true });
}

export function register(input: RegistrationRequest) {
  return apiPost<RegistrationResponse>('/v1/registrations', input);
}

export function confirmEmailVerification(token: string) {
  return apiVoid('/v1/email-verifications/confirm', { method: 'POST', body: { token } });
}

export function confirmEmailChange(token: string) {
  return apiVoid('/v1/email-changes/confirm', { method: 'POST', body: { token } });
}

export function requestEmailVerificationEmail() {
  return apiVoid('/v1/email-verification-requests', { method: 'POST' });
}
