import { setupServer } from 'msw/node';

import { createMockDb } from './db';
import { createHandlers } from './handlers';

export const mockDb = createMockDb();

export function resetMockDb(): void {
  Object.assign(mockDb, createMockDb());
}

export const server = setupServer(...createHandlers(mockDb));

export * from './db';
