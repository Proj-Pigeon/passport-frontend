import { useCallback, useEffect, useRef, useState } from 'react';

export interface CountdownState {
  remaining: number;
  running: boolean;
  start: (seconds: number) => void;
  reset: () => void;
}

export function useCountdown(initialSeconds = 0): CountdownState {
  const [remaining, setRemaining] = useState(initialSeconds);
  const deadline = useRef<number | null>(null);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      const target = deadline.current ?? Date.now();
      setRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const start = useCallback((seconds: number) => {
    const value = Math.max(0, Math.floor(seconds));
    if (value === 0) {
      deadline.current = null;
      setRemaining(0);
      return;
    }
    deadline.current = Date.now() + value * 1000;
    setRemaining(value);
  }, []);

  const reset = useCallback(() => {
    deadline.current = null;
    setRemaining(0);
  }, []);

  return { remaining, running: remaining > 0, start, reset };
}
