import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bumpAvatarVersion(): void {
  version = Date.now();
  listeners.forEach((listener) => listener());
}

export function useAvatarVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}
