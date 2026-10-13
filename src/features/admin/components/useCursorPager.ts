import { useCallback, useState } from 'react';

export interface CursorPagerState {
  cursor: string | null;
  hasPrev: boolean;
  goNext: (nextCursor: string) => void;
  goPrev: () => void;
  reset: () => void;
}

export function useCursorPager(): CursorPagerState {
  const [cursors, setCursors] = useState<string[]>([]);

  const goNext = useCallback((nextCursor: string) => {
    setCursors((previous) => [...previous, nextCursor]);
  }, []);

  const goPrev = useCallback(() => {
    setCursors((previous) => previous.slice(0, -1));
  }, []);

  const reset = useCallback(() => {
    setCursors([]);
  }, []);

  return {
    cursor: cursors.length > 0 ? (cursors[cursors.length - 1] as string) : null,
    hasPrev: cursors.length > 0,
    goNext,
    goPrev,
    reset,
  };
}
