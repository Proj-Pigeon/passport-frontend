import { env } from './env';

export function isTurnstileEnabled(): boolean {
  return env.turnstileSiteKey !== null;
}
