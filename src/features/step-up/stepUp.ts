import { isApiError } from '@/api/errors';

export const STEP_UP_GRACE_MS = 30_000;

export function isStepUpActive(
  expiresAt: string | null | undefined,
  now = Date.now(),
  graceMs = STEP_UP_GRACE_MS,
): boolean {
  if (!expiresAt) {
    return false;
  }
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) {
    return false;
  }
  return deadline - graceMs > now;
}

export function isStepUpRequired(error: unknown): boolean {
  return isApiError(error) && error.status === 403 && error.code === 'forbidden';
}
