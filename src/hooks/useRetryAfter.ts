import { useCallback } from 'react';

import { isApiError } from '@/api/errors';
import { useCountdown, type CountdownState } from '@/hooks/useCountdown';

export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export interface RetryAfterState extends CountdownState {
  arm: (error: unknown) => boolean;
}

export function useRetryAfter(): RetryAfterState {
  const countdown = useCountdown();
  const { start } = countdown;

  const arm = useCallback(
    (error: unknown): boolean => {
      if (!isApiError(error) || error.status !== 429) {
        return false;
      }
      start(error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS);
      return true;
    },
    [start],
  );

  return { ...countdown, arm };
}
