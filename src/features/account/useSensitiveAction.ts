import { isApiError } from '@/api/errors';
import { useSession } from '@/features/session/useSession';
import { useStepUp } from '@/features/step-up/useStepUp';

export interface UseSensitiveActionResult {
  requiresStepUp: boolean;
  requiresPassword: boolean;
  runSensitive: <T>(action: () => Promise<T>) => Promise<T>;
}

export function useSensitiveAction(): UseSensitiveActionResult {
  const { user } = useSession();
  const { ensureStepUp } = useStepUp();

  const requiresStepUp = (user?.step_up_required ?? true) && user?.has_passkey === true;

  async function runSensitive<T>(action: () => Promise<T>): Promise<T> {
    if (requiresStepUp) {
      await ensureStepUp();
    }
    try {
      return await action();
    } catch (error) {
      if (
        !requiresStepUp &&
        isApiError(error) &&
        error.status === 403 &&
        error.code === 'forbidden'
      ) {
        await ensureStepUp({ force: true });
        return action();
      }
      throw error;
    }
  }

  return { requiresStepUp, requiresPassword: !requiresStepUp, runSensitive };
}
