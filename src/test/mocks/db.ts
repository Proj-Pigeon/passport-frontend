import type { AccountStatus, AuthenticationMethod, AuthenticatorTransport } from '@/api/types';

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

export interface MockPasskey {
  id: string;
  user_id: string;
  credential_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  backup_eligible: boolean;
  backup_state: boolean;
  transports: AuthenticatorTransport[];
}

export interface MockAvatar {
  mediaType: string;
  content: Uint8Array;
}

export type CeremonyKind = 'login' | 'step_up' | 'registration';

export interface MockInteraction {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  expires_at: string;
  approveUrl: string;
  denyUrl: string;
  boundUserId: string | null;
}

export interface MockDb {
  users: MockUser[];
  verificationTokens: Map<string, string>;
  resetTokens: Map<string, string>;
  session: MockSession | null;
  currentUserId: string | null;
  csrfToken: string;
  requireCsrf: boolean;
  passkeys: MockPasskey[];
  avatar: MockAvatar | null;
  ceremonies: Map<string, CeremonyKind>;
  takenExternalIdentities: Set<string>;
  interactions: Map<string, MockInteraction>;
}

export const MOCK_CSRF_TOKEN = 'mock-csrf-token';

export const STEP_UP_TTL_MS = 10 * 60_000;

export const INTERACTION_TTL_MS = 5 * 60_000;

export function createMockDb(): MockDb {
  return {
    users: [],
    verificationTokens: new Map(),
    resetTokens: new Map(),
    session: null,
    currentUserId: null,
    csrfToken: MOCK_CSRF_TOKEN,
    requireCsrf: true,
    passkeys: [],
    avatar: null,
    ceremonies: new Map(),
    takenExternalIdentities: new Set(),
    interactions: new Map(),
  };
}

export function markExternalIdentityTaken(db: MockDb, slug: string): void {
  db.takenExternalIdentities.add(slug);
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

export function seedPasskey(db: MockDb, overrides: Partial<MockPasskey> = {}): MockPasskey {
  const passkey: MockPasskey = {
    id: `pk_${db.passkeys.length + 1}`,
    user_id: db.currentUserId ?? 'usr_seed',
    credential_id: `cred_${db.passkeys.length + 1}`,
    label: '',
    created_at: new Date().toISOString(),
    last_used_at: null,
    backup_eligible: true,
    backup_state: false,
    transports: ['internal', 'hybrid'],
    ...overrides,
  };
  db.passkeys.push(passkey);
  return passkey;
}

export function hasStepUp(db: MockDb, now = Date.now()): boolean {
  const expiresAt = db.session?.step_up_expires_at;
  if (!expiresAt) {
    return false;
  }
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) && deadline > now;
}

export function grantStepUp(db: MockDb, ttlMs = STEP_UP_TTL_MS): void {
  if (db.session) {
    db.session.step_up_expires_at = new Date(Date.now() + ttlMs).toISOString();
  }
}

export function passkeysOf(db: MockDb, userId: string): MockPasskey[] {
  return db.passkeys.filter((passkey) => passkey.user_id === userId);
}

export function startCeremony(db: MockDb, kind: CeremonyKind): string {
  const ceremonyId = `wac_${db.ceremonies.size + 1}_${kind}`;
  db.ceremonies.set(ceremonyId, kind);
  return ceremonyId;
}

export function seedInteraction(db: MockDb, overrides: Partial<MockInteraction> = {}): MockInteraction {
  const interaction: MockInteraction = {
    id: `int_${db.interactions.size + 1}`,
    client_id: 'oc_mock',
    client_name: 'Mock Client',
    scopes: ['openid', 'profile'],
    expires_at: new Date(Date.now() + INTERACTION_TTL_MS).toISOString(),
    approveUrl: 'https://client.example.test/callback?code=ac_mock&state=st_mock',
    denyUrl: 'https://client.example.test/callback?error=access_denied&state=st_mock',
    boundUserId: db.currentUserId,
    ...overrides,
  };
  db.interactions.set(interaction.id, interaction);
  return interaction;
}

export function consumeCeremony(db: MockDb, ceremonyId: string, kind: CeremonyKind): boolean {
  if (db.ceremonies.get(ceremonyId) !== kind) {
    return false;
  }
  db.ceremonies.delete(ceremonyId);
  return true;
}
