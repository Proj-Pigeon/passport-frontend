import type { AccountStatus, AuthenticationMethod, AuthenticatorTransport } from '@/api/types';
import type {
  AdminAuditEvent,
  AdminBackupExercise,
  AdminCapability,
  AdminChangeAction,
  AdminChangeRequest,
  AdminConfigurationVersion,
  AdminHttpAccessRecordDetail,
  AdminKeyRotationRequest,
  AdminResourceKind,
  AdminResourceStatus,
  AdminResourceView,
  AdminRole,
} from '@/api/endpoints/admin/types';

export interface MockUser {
  id: string;
  username: string;
  email: string;
  password: string;
  display_name: string;
  email_verified: boolean;
  status: AccountStatus;
  has_password: boolean;
  step_up_required: boolean;
  pending_email?: string;
}

export interface MockSession {
  id: string;
  auth_time: string;
  amr: AuthenticationMethod[];
  acr: string | null;
  idle_expires_at: string;
  expires_at: string;
  step_up_expires_at?: string;
  step_up_method?: 'passkey' | 'password';
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
  aaguid?: string;
  authenticator_attachment?: AuthenticatorAttachment;
  transports: AuthenticatorTransport[];
}

export interface MockAvatar {
  mediaType: string;
  content: Uint8Array;
}

export type CeremonyKind = 'login' | 'step_up' | 'registration' | 'admin_login' | 'admin_step_up';

export interface MockInteraction {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  expires_at: string;
  approveUrl: string;
  denyUrl: string;
  boundUserId: string | null;
  logo_url?: string;
  developer_name?: string;
  developer_url?: string;
}

export interface MockAdminSession {
  user_id: string;
  username: string;
  session_id: string;
  roles: AdminRole[];
  capabilities: AdminCapability[];
  amr: string[];
  step_up_expires_at: string | null;
}

export interface MockAdminExternalIdentity {
  id: string;
  provider: string;
  provider_type: string;
  created_at: string;
  last_used_at: string | null;
}

export interface MockAdminUser {
  id: string;
  username: string;
  display_name: string | null;
  status: AccountStatus;
  security_epoch: number;
  created_at: string;
  updated_at: string;
  has_password: boolean;
  email_verified: boolean;
  passkey_count: number;
  active_session_count: number;
  active_grant_count: number;
  external_identities: MockAdminExternalIdentity[];
}

export interface MockAdminResource {
  secret_set?: boolean;
  id: string;
  kind: AdminResourceKind;
  application_id?: string;
  client_id?: string;
  display_name: string;
  status: AdminResourceStatus;
  version: number;
  configuration: Record<string, unknown>;
  published_configuration: Record<string, unknown> | null;
  configuration_version_id: string | null;
  change_requests: AdminChangeRequest[];
  created_at: string;
  updated_at: string;
}

export interface MockDb {
  users: MockUser[];
  verificationTokens: Map<string, string>;
  resetTokens: Map<string, string>;
  emailChangeTokens: Map<string, string>;
  session: MockSession | null;
  currentUserId: string | null;
  csrfToken: string;
  requireCsrf: boolean;
  passkeys: MockPasskey[];
  avatar: MockAvatar | null;
  ceremonies: Map<string, CeremonyKind>;
  takenExternalIdentities: Set<string>;
  linkedExternalIdentities: MockLinkedExternalIdentity[];
  interactions: Map<string, MockInteraction>;
  adminSession: MockAdminSession | null;
  adminCsrfToken: string;
  adminRolesOf: Map<string, AdminRole[]>;
  adminUsers: MockAdminUser[];
  adminResources: MockAdminResource[];
  adminAuditEvents: AdminAuditEvent[];
  adminHttpAccessRecords: AdminHttpAccessRecordDetail[];
  adminConfigVersions: AdminConfigurationVersion[];
  adminKeyRotations: AdminKeyRotationRequest[];
  adminBackupExercises: AdminBackupExercise[];
  adminSecretCounter: number;
}

export const MOCK_CSRF_TOKEN = 'mock-csrf-token';

export const MOCK_ADMIN_CSRF_TOKEN = 'mock-admin-csrf-token';

export const ADMIN_STEP_UP_TTL_MS = 5 * 60_000;

const ALL_CAPABILITIES: AdminCapability[] = [
  'users:read',
  'users:write',
  'applications:read',
  'applications:write',
  'applications:approve',
  'federation:read',
  'federation:write',
  'audit:read',
  'audit:resolve',
  'config:read',
  'keys:write',
  'keys:approve',
  'operations:read',
];

const ROLE_CAPABILITIES: Record<AdminRole, AdminCapability[]> = {
  super_admin: ALL_CAPABILITIES,
  user_admin: ['users:read', 'users:write'],
  application_admin: ['applications:read', 'applications:write'],
  application_approver: ['applications:read', 'applications:approve'],
  federation_admin: ['federation:read', 'federation:write'],
  auditor: [
    'users:read',
    'applications:read',
    'federation:read',
    'audit:read',
    'config:read',
    'operations:read',
  ],
  key_admin: ['keys:write', 'config:read'],
  key_approver: ['keys:approve', 'config:read'],
  operator: ['operations:read', 'config:read'],
};

export function capabilitiesForRoles(roles: AdminRole[]): AdminCapability[] {
  return [...new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role] ?? []))];
}

export const STEP_UP_TTL_MS = 10 * 60_000;

export const INTERACTION_TTL_MS = 5 * 60_000;

export function createMockDb(): MockDb {
  return {
    users: [],
    verificationTokens: new Map(),
    resetTokens: new Map(),
    emailChangeTokens: new Map(),
    session: null,
    currentUserId: null,
    csrfToken: MOCK_CSRF_TOKEN,
    requireCsrf: true,
    passkeys: [],
    avatar: null,
    ceremonies: new Map(),
    takenExternalIdentities: new Set(),
    linkedExternalIdentities: [],
    interactions: new Map(),
    adminSession: null,
    adminCsrfToken: MOCK_ADMIN_CSRF_TOKEN,
    adminRolesOf: new Map(),
    adminUsers: [],
    adminResources: [],
    adminAuditEvents: [],
    adminHttpAccessRecords: [],
    adminConfigVersions: [],
    adminKeyRotations: [],
    adminBackupExercises: [],
    adminSecretCounter: 0,
  };
}

export function markExternalIdentityTaken(db: MockDb, slug: string): void {
  db.takenExternalIdentities.add(slug);
}

export interface MockLinkedExternalIdentity {
  id: string;
  provider_slug: string;
  provider_display_name: string;
  display_name: string | null;
  email_hint: string | null;
  created_at: string;
  last_used_at: string | null;
}

export function seedLinkedExternalIdentity(
  db: MockDb,
  providerSlug: string,
  providerDisplayName: string,
  email: string | null = null,
): MockLinkedExternalIdentity {
  const identity: MockLinkedExternalIdentity = {
    id: `ext_mock_${db.linkedExternalIdentities.length + 1}`,
    provider_slug: providerSlug,
    provider_display_name: providerDisplayName,
    display_name: email,
    email_hint: email,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  db.linkedExternalIdentities.push(identity);
  return identity;
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
    step_up_required: true,
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

export function stepUpSatisfied(db: MockDb): boolean {
  const user = currentUser(db);
  if (user && !user.step_up_required) {
    return true;
  }
  return hasStepUp(db);
}

export function grantStepUp(
  db: MockDb,
  ttlMs = STEP_UP_TTL_MS,
  method: 'passkey' | 'password' = 'passkey',
): void {
  if (db.session) {
    db.session.step_up_expires_at = new Date(Date.now() + ttlMs).toISOString();
    db.session.step_up_method = method;
  }
}

export function passkeysOf(db: MockDb, userId: string): MockPasskey[] {
  return db.passkeys.filter((passkey) => passkey.user_id === userId);
}

export function passkeyStepUpRequired(db: MockDb, user: MockUser): boolean {
  return user.step_up_required && passkeysOf(db, user.id).length > 0;
}

export function seedEmailChangeToken(
  db: MockDb,
  userId: string,
  token = `emc_${'x'.repeat(24)}`,
): string {
  db.emailChangeTokens.set(token, userId);
  return token;
}

export function startCeremony(db: MockDb, kind: CeremonyKind): string {
  const ceremonyId = `wac_${db.ceremonies.size + 1}_${kind}`;
  db.ceremonies.set(ceremonyId, kind);
  return ceremonyId;
}

export function seedInteraction(
  db: MockDb,
  overrides: Partial<MockInteraction> = {},
): MockInteraction {
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

export function grantAdminRole(db: MockDb, userId: string, roles: AdminRole[]): void {
  db.adminRolesOf.set(userId, roles);
}

export function adminRolesFor(db: MockDb, userId: string): AdminRole[] {
  return db.adminRolesOf.get(userId) ?? [];
}

export function signInAdmin(
  db: MockDb,
  user: MockUser,
  roles: AdminRole[],
  amr: string[] = ['pwd'],
): void {
  db.adminSession = {
    user_id: user.id,
    username: user.username,
    session_id: `adm_ses_${user.id}`,
    roles,
    capabilities: capabilitiesForRoles(roles),
    amr,
    step_up_expires_at: null,
  };
}

export function signOutAdmin(db: MockDb): void {
  db.adminSession = null;
}

export function hasAdminStepUp(db: MockDb, now = Date.now()): boolean {
  const expiresAt = db.adminSession?.step_up_expires_at;
  if (!expiresAt) {
    return false;
  }
  const deadline = Date.parse(expiresAt);
  return Number.isFinite(deadline) && deadline > now;
}

export function grantAdminStepUp(db: MockDb, ttlMs = ADMIN_STEP_UP_TTL_MS): void {
  if (db.adminSession) {
    db.adminSession.step_up_expires_at = new Date(Date.now() + ttlMs).toISOString();
  }
}

export function seedAdminUser(db: MockDb, overrides: Partial<MockAdminUser> = {}): MockAdminUser {
  const user: MockAdminUser = {
    id: 'adu_1',
    username: 'bob',
    display_name: 'Bob',
    status: 'active',
    security_epoch: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    has_password: true,
    email_verified: true,
    passkey_count: 0,
    active_session_count: 1,
    active_grant_count: 0,
    external_identities: [],
    ...overrides,
  };
  db.adminUsers.push(user);
  return user;
}

export function seedAdminResource(
  db: MockDb,
  overrides: Partial<MockAdminResource> = {},
): MockAdminResource {
  const resource: MockAdminResource = {
    id: 'adr_1',
    kind: 'application',
    display_name: 'Demo App',
    status: 'draft',
    version: 1,
    configuration: {},
    published_configuration: null,
    configuration_version_id: null,
    change_requests: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
  db.adminResources.push(resource);
  return resource;
}

export function seedAdminChangeRequest(
  resource: MockAdminResource,
  overrides: Partial<AdminChangeRequest> = {},
): AdminChangeRequest {
  const change: AdminChangeRequest = {
    id: `cr_${resource.change_requests.length + 1}`,
    action: 'activate' satisfies AdminChangeAction,
    base_version: resource.version,
    status: 'pending',
    policy_version: 'pol_1',
    created_at: new Date().toISOString(),
    evaluated_diff: null,
    requested_by: 'adu_other',
    reason: 'mock reason',
    ...overrides,
  };
  resource.change_requests.push(change);
  return change;
}

export function seedAdminAuditEvent(
  db: MockDb,
  overrides: Partial<AdminAuditEvent> = {},
): AdminAuditEvent {
  const event: AdminAuditEvent = {
    id: `evt_${db.adminAuditEvents.length + 1}`,
    occurred_at: '2026-01-01T00:00:00Z',
    actor_type: 'admin',
    action: 'admin.user.suspended',
    target_type: 'user',
    result: 'success',
    request_id: `req_audit_${db.adminAuditEvents.length + 1}`,
    actor_id: 'adu_1',
    resource_id: 'usr_target',
    metadata: { reason: 'mock reason' },
    ...overrides,
  };
  db.adminAuditEvents.push(event);
  return event;
}

export function seedAdminHttpAccessRecord(
  db: MockDb,
  overrides: Partial<AdminHttpAccessRecordDetail> = {},
): AdminHttpAccessRecordDetail {
  const record: AdminHttpAccessRecordDetail = {
    id: `acc_${db.adminHttpAccessRecords.length + 1}`,
    occurred_at: '2026-01-01T00:00:00Z',
    actor_type: 'admin',
    actor_ref: null,
    method: 'POST',
    route: '/v1/sessions/password',
    status_code: 201,
    duration_ms: 42,
    request_id: `req_audit_${db.adminHttpAccessRecords.length + 1}`,
    request_media_type: 'application/json',
    request_body: '{"identifier":"alice@example.com"}',
    request_truncated: false,
    response_media_type: 'application/json',
    response_body: '{"result":"ok"}',
    response_truncated: false,
    actor_id: 'adu_1',
    ...overrides,
  };
  db.adminHttpAccessRecords.push(record);
  return record;
}

export function adminResourceView(
  resource: MockAdminResource,
  all: MockAdminResource[] = [],
): AdminResourceView {
  return {
    id: resource.id,
    kind: resource.kind,
    ...(resource.client_id !== undefined ? { client_id: resource.client_id } : {}),
    ...(resource.application_id !== undefined ? { application_id: resource.application_id } : {}),
    ...(resource.kind === 'application'
      ? {
          oauth_client_count: all.filter(
            (entry) => entry.kind === 'oauth' && entry.application_id === resource.id,
          ).length,
          saml_provider_count: all.filter(
            (entry) => entry.kind === 'saml' && entry.application_id === resource.id,
          ).length,
        }
      : {}),
    ...(resource.kind === 'federation' ? { secret_set: resource.secret_set ?? false } : {}),
    display_name: resource.display_name,
    status: resource.status,
    version: resource.version,
    configuration: resource.configuration,
    published_configuration: resource.published_configuration,
    configuration_version_id: resource.configuration_version_id,
    created_at: resource.created_at,
    updated_at: resource.updated_at,
    change_requests: resource.change_requests.map((change) => ({ ...change })),
  };
}
