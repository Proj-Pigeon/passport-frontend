export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'deactivated';

export type AuthenticationMethod = 'pwd' | 'passkey' | 'federation';

export type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid' | 'smart-card';

export interface CsrfTokenResponse {
  token: string;
}

export interface ComplianceDocuments {
  version: number;
  terms_markdown: string;
  privacy_markdown: string;
  cross_border_enabled: boolean;
  cross_border_markdown: string;
  updated_at: string;
}

export type ComplianceVersions = Record<string, number>;

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  status: AccountStatus;
  email: string;
  email_verified: boolean;
  roles?: string[];
  step_up_required: boolean;
  has_password?: boolean;
  has_passkey?: boolean;
}

export interface SessionInfo {
  id: string;
  auth_time: string;
  amr: AuthenticationMethod[];
  acr: string | null;
  idle_expires_at: string;
  expires_at: string;
  step_up_expires_at?: string;
  step_up_method?: 'passkey' | 'password';
}

export interface CurrentSessionResponse {
  session: SessionInfo;
  user: SessionUser;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  email: string;
  email_verified: boolean;
  pending_email?: string;
  status: AccountStatus;
  avatar_url: string | null;
  step_up_required: boolean;
}

export interface RegistrationRequest {
  username: string;
  email: string;
  password: string;
  display_name?: string;
  turnstile_token?: string;
  compliance_versions: ComplianceVersions;
}

export interface RegistrationResponse {
  user_id?: string;
  status: 'pending_verification';
}

export interface PasswordLoginRequest {
  identifier: string;
  password: string;
  turnstile_token?: string;
  compliance_versions: ComplianceVersions;
}

export interface RecoveryRequestInput {
  email: string;
  turnstile_token?: string;
}

export interface RecoveryRequestResponse {
  status: 'accepted';
}

export interface PasswordResetInput {
  token: string;
  password: string;
}

export interface AvatarUploadResult {
  url: string;
  media_type: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  bytes: number;
}

export interface Passkey {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  backup_eligible: boolean;
  backup_state: boolean;
  aaguid?: string;
  authenticator_attachment?: AuthenticatorAttachment;
  transports?: AuthenticatorTransport[];
}

export interface WebAuthnCeremony<TOptions = Record<string, unknown>> {
  ceremony_id: string;
  options: { publicKey: TOptions };
}

export interface LinkTransaction {
  continue_url: string;
}

export interface OAuthInteraction {
  interaction_id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  expires_at: string;
}

export interface OAuthContinueResult {
  continue_url: string;
}
