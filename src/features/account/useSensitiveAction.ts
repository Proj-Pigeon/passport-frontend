import { isApiError } from '@/api/errors';
import { useSession } from '@/features/session/useSession';
import { useStepUp } from '@/features/step-up/useStepUp';

export interface UseSensitiveActionResult {
  requiresPasskey: boolean;
  requiresPassword: boolean;
  runSensitive: <T>(action: () => Promise<T>) => Promise<T>;
}

export function useSensitiveAction(): UseSensitiveActionResult {
  const { user } = useSession();
  const { ensureStepUp } = useStepUp();

  const requiresPasskey = (user?.step_up_required ?? true) && user?.has_passkey === true;

  async function runSensitive<T>(action: () => Promise<T>): Promise<T> {
    if (requiresPasskey) {
      await ensureStepUp();
    }
    try {
      return await action();
    } catch (error) {
      if (
        !requiresPasskey &&
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

  return { requiresPasskey, requiresPassword: !requiresPasskey, runSensitive };
}
