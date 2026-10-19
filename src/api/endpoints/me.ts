import { apiBlobOrNull, apiDelete, apiGet, apiPatch, apiPut, apiVoid } from '../http';
import type { AvatarUploadResult, Profile } from '../types';

export const AVATAR_PATH = '/v1/me/avatar';

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface EmailChangeInput {
  new_email: string;
  current_password?: string;
}

export function getProfile(signal?: AbortSignal) {
  return apiGet<Profile>('/v1/me', { signal });
}

export function updateDisplayName(displayName: string) {
  return apiPatch<Profile>('/v1/me', { display_name: displayName });
}

export function updateStepUpPreference(stepUpRequired: boolean) {
  return apiPatch<Profile>('/v1/me', { step_up_required: stepUpRequired });
}

export function changePassword(input: ChangePasswordInput) {
  return apiVoid('/v1/me/password', { method: 'POST', body: input });
}

export function requestEmailChange(input: EmailChangeInput) {
  return apiVoid('/v1/email-change-requests', { method: 'POST', body: input });
}

export function getAvatar() {
  return apiBlobOrNull(AVATAR_PATH, { accept: 'image/*' });
}

export function uploadAvatar(image: Blob, contentType: string) {
  return apiPut<AvatarUploadResult>(AVATAR_PATH, undefined, {
    rawBody: image,
    contentType,
  });
}

export function deleteAvatar() {
  return apiDelete(AVATAR_PATH);
}
