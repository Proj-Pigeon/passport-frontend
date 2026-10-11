import type { AccountStatus, AuthenticationMethod } from '@/api/types';

export interface MockUser {
  id: string;
  username: string;
  email: string;
  password: string;
  display_name: string;
  email_verified: boolean;
  status: AccountStatus;
  has_password: boolean;
}

export interface MockSession {
  id: string;
  auth_time: string;
  amr: AuthenticationMethod[];
  acr: string | null;
  idle_expires_at: string;
  expires_at: string;
  step_up_expires_at?: string;
}

export interface MockDb {
  users: MockUser[];
  verificationTokens: Map<string, string>;
  resetTokens: Map<string, string>;
  session: MockSession | null;
  currentUserId: string | null;
  csrfToken: string;
  requireCsrf: boolean;
}

export const MOCK_CSRF_TOKEN = 'mock-csrf-token';

export function createMockDb(): MockDb {
  return {
    users: [],
    verificationTokens: new Map(),
    resetTokens: new Map(),
    session: null,
    currentUserId: null,
    csrfToken: MOCK_CSRF_TOKEN,
    requireCsrf: true,
  };
}

export function findUserByIdentifier(db: MockDb, identifier: string): MockUser | undefined {
  const normalized = identifier.trim().toLowerCase();
  return db.users.find(
    (user) => user.email === normalized || user.username === normalized || user.id === normalized,
  );
}

export function signIn(db: MockDb, user: MockUser, amr: AuthenticationMethod): void {
  const now = Date.now();
  db.currentUserId = user.id;
  db.session = {
    id: `ses_${user.id}`,
    auth_time: new Date(now).toISOString(),
    amr: [amr],
    acr: null,
    idle_expires_at: new Date(now + 30 * 60_000).toISOString(),
    expires_at: new Date(now + 12 * 3600_000).toISOString(),
  };
}

export function signOut(db: MockDb): void {
  db.session = null;
  db.currentUserId = null;
}

export function currentUser(db: MockDb): MockUser | null {
  if (!db.currentUserId) {
    return null;
  }
  return db.users.find((user) => user.id === db.currentUserId) ?? null;
}

export function seedUser(db: MockDb, overrides: Partial<MockUser> = {}): MockUser {
  const user: MockUser = {
    id: 'usr_seed',
    username: 'alice',
    email: 'alice@example.com',
    password: 'correct-horse-battery',
    display_name: 'Alice',
    email_verified: true,
    status: 'active',
    has_password: true,
    ...overrides,
  };
  db.users.push(user);
  return user;
}
