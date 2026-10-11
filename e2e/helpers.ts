import type { APIRequestContext } from '@playwright/test';

export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const BACKEND_READY_URL = process.env.PASSPORT_READY_URL ?? 'http://localhost:8080/readyz';

export const VERIFY_EMAIL_SUBJECT = 'Verify your Passport email';
export const RESET_PASSWORD_SUBJECT = 'Reset your Passport password';

export function uniqueUsername(prefix = 'e2e'): string {
  const random = Math.floor(Math.random() * 46_656).toString(36);
  return `${prefix}${Date.now().toString(36)}${random}`.slice(0, 32);
}

export function emailFor(username: string): string {
  return `${username}@example.com`;
}

export async function requireBackend(request: APIRequestContext): Promise<void> {
  const response = await request.get(BACKEND_READY_URL).catch(() => null);
  if (!response?.ok()) {
    throw new Error(
      `Passport backend is not reachable at ${BACKEND_READY_URL}. ` +
        'Start it first: cd ../passport-backend && docker compose up -d',
    );
  }
}

interface MailpitSummary {
  messages?: { ID: string; Subject: string }[];
}

interface MailpitMessage {
  Text?: string;
}

export async function readMailToken(
  request: APIRequestContext,
  to: string,
  subject: string,
): Promise<string> {
  const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
    params: { query: `to:${to}`, limit: '20' },
  });
  if (!search.ok()) {
    throw new Error(`Mailpit search returned ${search.status()}`);
  }

  const { messages } = (await search.json()) as MailpitSummary;
  const match = (messages ?? []).find((message) => message.Subject === subject);
  if (!match) {
    throw new Error(`no "${subject}" email addressed to ${to} yet`);
  }

  const detail = await request.get(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
  if (!detail.ok()) {
    throw new Error(`Mailpit message ${match.ID} returned ${detail.status()}`);
  }

  const { Text: text } = (await detail.json()) as MailpitMessage;
  const token = /token: (\S+)/.exec(text ?? '')?.[1];
  if (!token) {
    throw new Error(`no token found in the "${subject}" email body`);
  }
  return token;
}

export async function waitForMailToken(
  request: APIRequestContext,
  to: string,
  subject: string,
  timeoutMs = 25_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt yet';

  while (Date.now() < deadline) {
    try {
      return await readMailToken(request, to, subject);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for "${subject}" to ${to}: ${lastError}\n` +
      `These tests read the one-time token out of Mailpit (${MAILPIT_URL}), so the worker must ` +
      'deliver mail there. If passport-backend/docker-compose.override.yml points ' +
      'PASSPORT_SMTP_ADDR at a real provider (e.g. smtp.feishu.cn:465), switch the worker back ' +
      'with: PASSPORT_SMTP_ADDR=mailpit:1025, then `docker compose up -d worker`.',
  );
}

export async function requireReadableMailbox(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${MAILPIT_URL}/api/v1/info`).catch(() => null);
  if (!response?.ok()) {
    throw new Error(
      `Mailpit is not reachable at ${MAILPIT_URL}. Start it with: ` +
        'cd ../passport-backend && docker compose up -d mailpit',
    );
  }
}
