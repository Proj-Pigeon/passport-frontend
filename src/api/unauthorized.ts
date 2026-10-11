export interface UnauthorizedEvent {
  path: string;
  method: string;
  requestId: string | null;
}

type UnauthorizedHandler = (event: UnauthorizedEvent) => void;

let handler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

export function emitUnauthorized(event: UnauthorizedEvent): void {
  handler?.(event);
}
