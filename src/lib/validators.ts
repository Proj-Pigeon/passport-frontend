import { z } from 'zod';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;
export const EMAIL_MAX_BYTES = 320;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX_BYTES = 1024;
export const DISPLAY_NAME_MAX = 80;
export const MAIL_TOKEN_MIN = 20;

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,63}$/;
export const EMAIL_PATTERN = /^[^\s@,;:<>"[\]\\]+@[^\s@,;:<>"[\]\\]+$/;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

const encoder = new TextEncoder();

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeDisplayName(value: string): string {
  return value.trim().normalize('NFC');
}

function issue(ctx: z.RefinementCtx, message: string): void {
  ctx.addIssue({ code: 'custom', message });
}

export const usernameSchema = z.string().superRefine((raw, ctx) => {
  const value = normalizeUsername(raw);
  if (value.length === 0) {
    issue(ctx, 'validation.username.required');
    return;
  }
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX) {
    issue(ctx, 'validation.username.length');
    return;
  }
  if (!USERNAME_PATTERN.test(value)) {
    issue(ctx, 'validation.username.invalid_format');
  }
});

export const emailSchema = z.string().superRefine((raw, ctx) => {
  const value = normalizeEmail(raw);
  if (value.length === 0) {
    issue(ctx, 'validation.email.required');
    return;
  }
  if (byteLength(value) > EMAIL_MAX_BYTES) {
    issue(ctx, 'validation.email.too_long');
    return;
  }
  if (!EMAIL_PATTERN.test(value)) {
    issue(ctx, 'validation.email.invalid_format');
  }
});

export const passwordSchema = z.string().superRefine((value, ctx) => {
  if (value.length === 0) {
    issue(ctx, 'validation.password.required');
    return;
  }
  if (value.length < PASSWORD_MIN) {
    issue(ctx, 'validation.password.too_short');
    return;
  }
  if (byteLength(value) > PASSWORD_MAX_BYTES) {
    issue(ctx, 'validation.password.too_long');
  }
});

export const nonEmptyPasswordSchema = z.string().superRefine((value, ctx) => {
  if (value.length === 0) {
    issue(ctx, 'validation.password.required');
  }
});

export const identifierSchema = z.string().superRefine((value, ctx) => {
  if (value.trim().length === 0) {
    issue(ctx, 'validation.identifier.required');
  }
});

export const displayNameSchema = z.string().superRefine((raw, ctx) => {
  const value = normalizeDisplayName(raw);
  if (codePointLength(value) > DISPLAY_NAME_MAX) {
    issue(ctx, 'validation.display_name.too_long');
    return;
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    issue(ctx, 'validation.display_name.invalid_characters');
  }
});

export const passkeyLabelSchema = displayNameSchema;

export const mailTokenSchema = z.string().superRefine((raw, ctx) => {
  if (raw.trim().length < MAIL_TOKEN_MIN) {
    issue(ctx, 'validation.token.invalid');
  }
});

export const registrationSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  display_name: displayNameSchema,
});

export const loginSchema = z.object({
  identifier: identifierSchema,
  password: nonEmptyPasswordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.confirmPassword.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'validation.confirm_password.required',
      });
      return;
    }
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'validation.confirm_password.mismatch',
      });
    }
  });

export type RegistrationFormValues = z.infer<typeof registrationSchema>;
export type LoginFormValues = z.infer<typeof loginSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function passwordStrengthScore(password: string): number {
  if (password.length === 0) {
    return 0;
  }
  return passwordChecks(password).filter((check) => check.passed).length;
}

export interface PasswordCheck {
  key: 'length' | 'case' | 'digit' | 'symbol' | 'unique';
  passed: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { key: 'length', passed: password.length >= PASSWORD_MIN },
    { key: 'case', passed: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { key: 'digit', passed: /\d/.test(password) },
    { key: 'symbol', passed: /[^\w\s]/.test(password) },
    {
      key: 'unique',
      passed: password.length > 0 && new Set(password).size >= Math.min(10, password.length),
    },
  ];
}
