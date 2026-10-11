import { describe, expect, it } from 'vitest';

import {
  byteLength,
  codePointLength,
  displayNameSchema,
  emailSchema,
  identifierSchema,
  loginSchema,
  mailTokenSchema,
  normalizeDisplayName,
  normalizeEmail,
  normalizeUsername,
  passwordChecks,
  passwordSchema,
  passwordStrengthScore,
  registrationSchema,
  resetPasswordSchema,
  usernameSchema,
} from './validators';

function messages(result: { error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('normalize helpers', () => {
  it('lowercases and trims the username', () => {
    expect(normalizeUsername('  Alice.Smith ')).toBe('alice.smith');
  });

  it('lowercases and trims the email', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });

  it('trims and NFC-normalizes the display name', () => {
    expect(normalizeDisplayName('  Alice  ')).toBe('Alice');
    expect(normalizeDisplayName('é')).toBe('\u00e9');
  });
});

describe('usernameSchema', () => {
  it.each(['alice', 'a1_b-c.d', 'alice.smith', '0abc'])('accepts %s', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each(['Alice.Smith', ' ALICE ', 'Alice123'])('accepts %s after normalization', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it('rejects empty input', () => {
    expect(messages(usernameSchema.safeParse(''))).toEqual(['validation.username.required']);
  });

  it.each(['ab', 'a'.repeat(65)])('rejects out-of-range length', (value) => {
    expect(messages(usernameSchema.safeParse(value))).toEqual(['validation.username.length']);
  });

  it.each(['_alice', '.alice', '-alice', 'al ice', 'ali!ce'])('rejects %s', (value) => {
    expect(messages(usernameSchema.safeParse(value))).toEqual([
      'validation.username.invalid_format',
    ]);
  });

  it('accepts separators after the first character', () => {
    expect(usernameSchema.safeParse('a_b-c.d').success).toBe(true);
    expect(usernameSchema.safeParse('ali..ce').success).toBe(true);
    expect(usernameSchema.safeParse('a'.repeat(64)).success).toBe(true);
  });
});

describe('emailSchema', () => {
  it.each(['alice@example.com', 'a.b+c@sub.example.co.uk'])('accepts %s', (value) => {
    expect(emailSchema.safeParse(value).success).toBe(true);
  });

  it('rejects empty input', () => {
    expect(messages(emailSchema.safeParse(''))).toEqual(['validation.email.required']);
  });

  it.each(['alice', 'alice@', '@example.com', 'alice @example.com', 'alice@exa mple.com'])(
    'rejects %s',
    (value) => {
      expect(messages(emailSchema.safeParse(value))).toEqual(['validation.email.invalid_format']);
    },
  );

  it('rejects emails longer than 320 bytes', () => {
    const long = `${'a'.repeat(320)}@example.com`;
    expect(messages(emailSchema.safeParse(long))).toEqual(['validation.email.too_long']);
  });
});

describe('passwordSchema', () => {
  it('accepts 12 to 1024 bytes', () => {
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(1024)).success).toBe(true);
  });

  it('rejects empty input', () => {
    expect(messages(passwordSchema.safeParse(''))).toEqual(['validation.password.required']);
  });

  it('rejects short passwords', () => {
    expect(messages(passwordSchema.safeParse('a'.repeat(11)))).toEqual([
      'validation.password.too_short',
    ]);
  });

  it('rejects passwords over the byte limit', () => {
    expect(messages(passwordSchema.safeParse('a'.repeat(1025)))).toEqual([
      'validation.password.too_long',
    ]);
  });

  it('counts bytes, not code units, for multibyte passwords', () => {
    expect(byteLength('密码'.repeat(6))).toBe(36);
    expect(passwordSchema.safeParse('密码密码密码密码密码密码').success).toBe(true);
  });
});

describe('displayNameSchema', () => {
  it('allows empty values', () => {
    expect(displayNameSchema.safeParse('').success).toBe(true);
    expect(displayNameSchema.safeParse('   ').success).toBe(true);
  });

  it('counts code points, not UTF-16 units', () => {
    expect(codePointLength('𝔘nicode')).toBe(7);
    expect(displayNameSchema.safeParse('😀'.repeat(80)).success).toBe(true);
    expect(messages(displayNameSchema.safeParse('😀'.repeat(81)))).toEqual([
      'validation.display_name.too_long',
    ]);
  });

  it('rejects control characters', () => {
    expect(messages(displayNameSchema.safeParse('ali\u0007ce'))).toEqual([
      'validation.display_name.invalid_characters',
    ]);
  });
});

describe('mailTokenSchema', () => {
  it('requires at least 20 characters', () => {
    expect(mailTokenSchema.safeParse('a'.repeat(20)).success).toBe(true);
    expect(messages(mailTokenSchema.safeParse('a'.repeat(19)))).toEqual([
      'validation.token.invalid',
    ]);
  });
});

describe('identifierSchema', () => {
  it('requires a non-empty value', () => {
    expect(identifierSchema.safeParse('alice').success).toBe(true);
    expect(messages(identifierSchema.safeParse('   '))).toEqual(['validation.identifier.required']);
  });
});

describe('composite schemas', () => {
  it('validates the registration form', () => {
    const valid = registrationSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: 'correct-horse-battery',
      display_name: 'Alice',
    });
    expect(valid.success).toBe(true);
  });

  it('reports per-field registration errors', () => {
    const result = registrationSchema.safeParse({
      username: 'ab',
      email: 'nope',
      password: 'short',
      display_name: 'x'.repeat(81),
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.map((issue) => issue.path.join('.'))).toEqual([
      'username',
      'email',
      'password',
      'display_name',
    ]);
  });

  it('validates the login form without enforcing password length', () => {
    expect(loginSchema.safeParse({ identifier: 'alice', password: 'x' }).success).toBe(true);
  });

  it('flags a confirm-password mismatch on the confirmPassword path', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-batterz',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['confirmPassword']);
    expect(result.error?.issues[0]?.message).toBe('validation.confirm_password.mismatch');
  });

  it('accepts matching passwords', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      }).success,
    ).toBe(true);
  });
});

describe('passwordStrengthScore', () => {
  it('is zero for an empty password', () => {
    expect(passwordStrengthScore('')).toBe(0);
  });

  it('rises with variety', () => {
    expect(passwordStrengthScore('aaaaaaaaaaaa')).toBeLessThan(
      passwordStrengthScore('Aa1!bbbbcccc'),
    );
    expect(passwordStrengthScore('Aa1!xQ9#mZ7@')).toBe(5);
  });

  it('reports each check independently', () => {
    const checks = passwordChecks('Aa1!xQ9#mZ7@');
    expect(checks.every((check) => check.passed)).toBe(true);
    expect(passwordChecks('abc').map((check) => check.key)).toEqual([
      'length',
      'case',
      'digit',
      'symbol',
      'unique',
    ]);
  });
});
