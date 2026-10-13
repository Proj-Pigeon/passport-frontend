import type { ApiScope } from './csrf';

export interface UnauthorizedEvent {
  path: string;
  method: string;
  requestId: string | null;
  scope: ApiScope;
}

type UnauthorizedHandler = (event: UnauthorizedEvent) => void;

let handler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

export function emitUnauthorized(event: UnauthorizedEvent): void {
  handler?.(event);
}
