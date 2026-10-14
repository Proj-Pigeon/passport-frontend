import type { AccountStatus } from '@/api/types';

export type AdminRole =
  | 'super_admin'
  | 'user_admin'
  | 'application_admin'
  | 'application_approver'
  | 'federation_admin'
  | 'auditor'
  | 'key_admin'
  | 'key_approver'
  | 'operator';

export type AdminCapability =
  | 'users:read'
  | 'users:write'
  | 'applications:read'
  | 'applications:write'
  | 'applications:approve'
  | 'federation:read'
  | 'federation:write'
  | 'audit:read'
  | 'audit:resolve'
  | 'config:read'
  | 'config:write'
  | 'keys:write'
  | 'keys:approve'
  | 'operations:read';

export interface AdminLoginRequest {
  identifier: string;
  password: string;
  turnstile_token?: string;
}

export interface AdminSessionInfo {
  user_id: string;
  username: string;
  session_id: string;
  roles: AdminRole[];
  capabilities: AdminCapability[];
  amr: string[];
  step_up_expires_at: string | null;
  step_up_fresh: boolean;
}

export interface AdminPage<T> {
  items: T[];
  next_cursor: string;
}

export type AdminUserStatusFilter = 'active' | 'suspended' | 'pending_verification' | 'deactivated';

export interface AdminUsersQuery {
  limit?: number;
  cursor?: string;
  q?: string;
  status?: AdminUserStatusFilter;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  display_name: string | null;
  status: AccountStatus;
  security_epoch: number;
  created_at: string;
  updated_at: string;
}

export interface AdminUserSecurity {
  has_password: boolean;
  email_verified: boolean;
  passkey_count: number;
  active_session_count: number;
  active_grant_count: number;
}

export interface AdminExternalIdentity {
  id: string;
  provider: string;
  provider_type: string;
  created_at: string;
  last_used_at: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  security: AdminUserSecurity;
  external_identities: AdminExternalIdentity[];
}

export type AdminAuditResult = 'success' | 'failure' | 'denied';

export interface AdminAuditQuery {
  limit?: number;
  cursor?: string;
  actor_id?: string;
  resource_id?: string;
  action?: string;
  result?: AdminAuditResult;
  from?: string;
  until?: string;
}

export interface AdminAuditEvent {
  id: string;
  occurred_at: string;
  actor_type: string;
  action: string;
  target_type: string;
  result: AdminAuditResult;
  request_id: string | null;
  actor_id?: string;
  resource_id?: string;
  resource_reference?: string;
  metadata?: Record<string, unknown>;
}

export interface AdminConfigurationVersion {
  id: string;
  version: number;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface AdminConfigurationVersionDetail extends AdminConfigurationVersion {
  document: Record<string, unknown>;
}

export interface AdminComplianceDocuments {
  version: number;
  terms_markdown: string;
  privacy_markdown: string;
  cross_border_enabled: boolean;
  cross_border_markdown: string;
  updated_at: string;
}

export type AdminComplianceDocumentsInput = Omit<AdminComplianceDocuments, 'version' | 'updated_at'>;

export type AdminKeyRotationProtocol = 'oidc' | 'saml';
export type AdminKeyRotationState = 'staged' | 'published' | 'active' | 'retiring';

export interface AdminKeyRotationRequest {
  id: string;
  protocol: AdminKeyRotationProtocol;
  state: AdminKeyRotationState;
  version: number;
  execution_status: string;
}

export interface AdminKeyRotationCreateInput {
  reason: string;
  protocol: AdminKeyRotationProtocol;
}

export interface AdminKeyRotationApprovalInput {
  reason: string;
  state: AdminKeyRotationState;
}

export type AdminBackupExerciseStatus = 'passed' | 'failed' | 'running';

export interface AdminBackupExercise {
  id: string;
  status: AdminBackupExerciseStatus;
  started_at: string;
  completed_at: string | null;
  recovery_time_seconds: number | null;
  recovery_point_seconds: number | null;
}

export type AdminResourceKind = 'application' | 'oauth' | 'saml' | 'federation';
export type AdminApprovableKind = 'application' | 'federation';
export type AdminResourceStatus = 'draft' | 'active' | 'disabled';

export type AdminChangeAction =
  'activate' | 'deactivate' | 'configuration' | 'create_secret' | 'rotate_secret';

export interface AdminChangeRequest {
  id: string;
  action: AdminChangeAction;
  base_version: number;
  status: string;
  policy_version: string;
  created_at: string;
  evaluated_diff: Record<string, unknown> | null;
  requested_by: string;
  reason: string;
}

export interface AdminResourceView {
  id: string;
  kind: AdminResourceKind;
  client_id?: string;
  application_id?: string;
  oauth_client_count?: number;
  saml_provider_count?: number;
  display_name: string;
  status: AdminResourceStatus;
  version: number;
  configuration: Record<string, unknown>;
  published_configuration: Record<string, unknown> | null;
  configuration_version_id: string | null;
  created_at: string;
  updated_at: string;
  change_requests?: AdminChangeRequest[];
  change_request_id?: string;
  trust_review_required?: boolean;
  secret_set?: boolean;
  sp_entity_id?: string;
  sp_acs_url?: string;
  sp_metadata_url?: string;
  sp_certificate_pem?: string;
  sp_certificate_fingerprint?: string;
}

export interface AdminResourceListQuery {
  limit?: number;
  cursor?: string;
  q?: string;
  status?: AdminResourceStatus;
  application_id?: string;
}

export interface AdminResourceInput {
  reason: string;
  application_id?: string;
  configuration: Record<string, unknown>;
}

export interface AdminActivationRequestInput {
  reason: string;
  action: AdminChangeAction;
  target_resource_id?: string;
}

export interface AdminActivationRequestResult {
  id: string;
  status: string;
  base_version: number;
  policy_version: string;
}

export interface AdminApprovalDecisionInput {
  reason: string;
  change_request_id: string;
  decision: 'approve' | 'reject';
}

export interface AdminApprovalDecisionResult {
  id: string;
  status: string;
  evaluated_diff: Record<string, unknown> | null;
  policy_version: string;
}

export interface AdminSecretRedeemInput {
  reason: string;
  change_request_id: string;
  overlap_seconds?: number;
}

export interface AdminSecretResult {
  client_secret: string;
  secret_version: number;
  overlap_seconds: number;
}

export interface AdminMetadataImportInput {
  reason: string;
  metadata: string;
  discovery_url?: string;
  format: 'saml' | 'oidc';
}

export interface AdminGrantRevocationInput {
  reason: string;
  user_id?: string;
}
