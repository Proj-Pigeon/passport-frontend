import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/errors';

import { isStepUpActive, isStepUpRequired, STEP_UP_GRACE_MS } from './stepUp';

const NOW = Date.parse('2026-10-11T02:00:00Z');

function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe('isStepUpActive', () => {
  it('is false without a timestamp or with a malformed one', () => {
    expect(isStepUpActive(undefined, NOW)).toBe(false);
    expect(isStepUpActive(null, NOW)).toBe(false);
    expect(isStepUpActive('not-a-date', NOW)).toBe(false);
  });

  it('is true well inside the window', () => {
    expect(isStepUpActive(at(10 * 60_000), NOW)).toBe(true);
  });

  it('treats the tail of the window as expired so the server never rejects us', () => {
    expect(isStepUpActive(at(STEP_UP_GRACE_MS + 1000), NOW)).toBe(true);
    expect(isStepUpActive(at(STEP_UP_GRACE_MS - 1000), NOW)).toBe(false);
    expect(isStepUpActive(at(-1000), NOW)).toBe(false);
  });
});

describe('isStepUpRequired', () => {
  it.each(['forbidden', 'account_step_up_required'])('matches a 403 %s envelope', (code) => {
    expect(isStepUpRequired(new ApiError({ status: 403, code, message: '' }))).toBe(true);
    expect(isStepUpRequired(new ApiError({ status: 401, code, message: '' }))).toBe(false);
  });

  it('ignores every other rejection', () => {
    expect(isStepUpRequired(new ApiError({ status: 401, code: 'unauthorized', message: '' }))).toBe(
      false,
    );
    expect(isStepUpRequired(new ApiError({ status: 403, code: 'conflict', message: '' }))).toBe(
      false,
    );
    expect(isStepUpRequired(new Error('forbidden'))).toBe(false);
    expect(isStepUpRequired(null)).toBe(false);
  });
});
