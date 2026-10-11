import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import {
  VERIFY_EMAIL_SUBJECT,
  emailFor,
  requireBackend,
  requireReadableMailbox,
  uniqueUsername,
  waitForMailToken,
} from './helpers';

const PASSWORD = 'correct-horse-battery';
const AVATAR_PATH = join(process.cwd(), 'e2e', 'fixtures', 'avatar.png');
const AVATAR_BYTES = readFileSync(AVATAR_PATH);

test.beforeEach(async ({ request }) => {
  await requireBackend(request);
  await requireReadableMailbox(request);
});

async function signInWithPassword(page: Page, username: string, password = PASSWORD) {
  await page.getByLabel(/^用户名或邮箱/).fill(username);
  await page.getByLabel(/^密码/).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();
}

async function createVerifiedAccount(page: Page, request: APIRequestContext) {
  const username = uniqueUsername();
  const email = emailFor(username);

  await page.goto('/register');
  await page.getByLabel(/^用户名/).fill(username);
  await page.getByLabel(/^邮箱/).fill(email);
  await page.getByLabel(/^密码/).fill(PASSWORD);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByRole('heading', { name: '请查收验证邮件' })).toBeVisible();

  const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

  await page.getByRole('link', { name: '去登录' }).click();
  await signInWithPassword(page, username);

  return { username, email };
}

async function useVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return { client, authenticatorId };
}

test.describe('account profile', () => {
  test('edits the display name and keeps it across a reload', async ({ page, request }) => {
    await createVerifiedAccount(page, request);

    await page.goto('/account/profile');
    await page.getByLabel(/^昵称/).fill('E2E 昵称');
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('资料已更新')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/^昵称/)).toHaveValue('E2E 昵称');
    await expect(page.getByRole('button', { name: '保存' })).toBeDisabled();

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();
    await expect(page.locator('header').getByText('E2E 昵称')).toBeVisible();
  });

  test('uploads an avatar and deletes it again', async ({ page, request }) => {
    await createVerifiedAccount(page, request);

    await page.goto('/account/profile');
    await expect(page.getByRole('button', { name: '删除' })).not.toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(AVATAR_PATH);
    await expect(page.getByText('avatar.png')).toBeVisible();
    await expect(page.getByText(/PNG · 136 B · 64 × 64/)).toBeVisible();

    await page.getByRole('button', { name: '上传头像' }).click();
    await expect(page.getByText('头像已更新')).toBeVisible();
    await expect(page.locator('img[src*="/v1/me/avatar"]').first()).toBeVisible();

    await page.getByRole('button', { name: '删除' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('删除头像')).toBeVisible();
    await dialog.getByRole('button', { name: '删除' }).click();

    await expect(page.getByText('头像已删除')).toBeVisible();
    await expect(page.locator('img[src*="/v1/me/avatar"]')).toHaveCount(0);
  });

  test('rejects an oversized image in the browser before uploading', async ({ page, request }) => {
    await createVerifiedAccount(page, request);

    await page.goto('/account/profile');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'oversized.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([AVATAR_BYTES, Buffer.alloc(600 * 1024)]),
    });

    await expect(page.getByText('图片超过 512 KB 限制。')).toBeVisible();
    await expect(page.getByRole('button', { name: '上传头像' })).not.toBeVisible();
  });

  test('shows the account summary with verification state and sign-in method', async ({
    page,
    request,
  }) => {
    const { email } = await createVerifiedAccount(page, request);

    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText('邮箱已验证')).toBeVisible();
    await expect(page.getByText('密码')).toBeVisible();
    await expect(page.getByText('尚未添加')).toBeVisible();
    await expect(page.getByText(/添加通行密钥后/)).toBeVisible();
  });
});

test.describe('passkeys', () => {
  test('registers, renames and deletes a passkey with step-up in between', async ({
    page,
    request,
  }) => {
    await createVerifiedAccount(page, request);
    await useVirtualAuthenticator(page);

    await page.goto('/account/security');
    await expect(page.getByText('还没有通行密钥')).toBeVisible();

    await page.getByRole('button', { name: '添加第一个通行密钥' }).click();
    await expect(page.getByText('通行密钥已添加')).toBeVisible();
    await expect(page.getByText('未命名密钥')).toBeVisible();

    await page.getByRole('button', { name: '重命名' }).click();
    await page.getByLabel('名称').fill('E2E Passkey');
    await page.getByRole('button', { name: '保存名称' }).click();
    await expect(page.getByText('安全验证')).toBeVisible();

    await page.getByRole('button', { name: '使用通行密钥验证' }).click();
    await expect(page.getByText('E2E Passkey')).toBeVisible();
    await expect(page.getByText(/剩余 \d+:\d{2}/)).toBeVisible();

    await page.getByRole('button', { name: '删除通行密钥' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/E2E Passkey/)).toBeVisible();
    await dialog.getByRole('button', { name: '删除' }).click();

    await expect(page.getByText('通行密钥已删除')).toBeVisible();
    await expect(page.getByText('还没有通行密钥')).toBeVisible();
  });

  test('signs in with a passkey after signing out', async ({ page, request }) => {
    await createVerifiedAccount(page, request);
    await useVirtualAuthenticator(page);

    await page.goto('/account/security');
    await page.getByRole('button', { name: '添加第一个通行密钥' }).click();
    await expect(page.getByText('通行密钥已添加')).toBeVisible();

    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    await page.getByRole('button', { name: '使用通行密钥登录' }).click();
    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto('/account/security');
    await page.getByRole('button', { name: '删除通行密钥' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '删除' }).click();
    await expect(page.getByText('安全验证')).toBeVisible();

    await page.getByRole('button', { name: '使用通行密钥验证' }).click();
    await expect(page.getByText('通行密钥已删除')).toBeVisible();
  });

  test('offers the passkey entry point on the login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
    await expect(page.getByRole('button', { name: '使用通行密钥登录' })).toBeVisible();
  });
});
