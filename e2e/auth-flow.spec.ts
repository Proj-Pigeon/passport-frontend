import { expect, test, type Page } from '@playwright/test';

import {
  RESET_PASSWORD_SUBJECT,
  VERIFY_EMAIL_SUBJECT,
  emailFor,
  requireBackend,
  requireReadableMailbox,
  uniqueUsername,
  waitForMailToken,
} from './helpers';

const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a-brand-new-secret';

test.beforeEach(async ({ request }) => {
  await requireBackend(request);
  await requireReadableMailbox(request);
});

async function register(page: Page, username: string, email: string) {
  await page.goto('/register');
  await page.getByLabel(/^用户名/).fill(username);
  await page.getByLabel(/^邮箱/).fill(email);
  await page.getByLabel(/^密码/).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByRole('heading', { name: '请查收验证邮件' })).toBeVisible();
}

async function signIn(page: Page, identifier: string, password: string) {
  await page.getByLabel(/^用户名或邮箱/).fill(identifier);
  await page.getByLabel(/^密码/).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

test.describe('account lifecycle', () => {
  test('register → verify email → login → logout', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);

    await register(page, username, email);
    await expect(page).toHaveURL(/\/register$/);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();
    await expect(page).toHaveURL(/\/verify-email$/);

    await page.getByRole('link', { name: '去登录' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, username, PASSWORD);
    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);

    await page.getByRole('button', { name: '用户菜单' }).click();
    await page.getByRole('menuitem', { name: '退出登录' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
  });

  test('accepts a verification token delivered in the URL fragment', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email#token=${token}`);

    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();
    expect(page.url()).not.toContain('token=');
  });

  test('an unverified account cannot log in and the reason is not disclosed', async ({ page }) => {
    const username = uniqueUsername();
    await register(page, username, emailFor(username));

    await page.goto('/login');
    await signIn(page, username, PASSWORD);

    await expect(page.getByText('账号或密码错误')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong password produces the identical message', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

    await page.getByRole('link', { name: '去登录' }).click();
    await signIn(page, username, 'an-entirely-wrong-password');

    await expect(page.getByText('账号或密码错误')).toBeVisible();
  });

  test('a replayed verification token is rejected', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '链接无效或已过期' })).toBeVisible();
  });

  test('an unknown verification token shows the invalid state', async ({ page }) => {
    await page.goto('/verify-email?token=this_token_was_never_issued');
    await expect(page.getByRole('heading', { name: '链接无效或已过期' })).toBeVisible();
  });

  test('opening the verification page without a token explains what to do', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { name: '缺少验证令牌' })).toBeVisible();
  });
});

test.describe('password recovery', () => {
  test('forgot → reset → login with the new password', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const verifyToken = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${verifyToken}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

    await page.goto('/forgot-password');
    await page.getByLabel(/^邮箱/).fill(email);
    await page.getByRole('button', { name: '发送重置邮件' }).click();
    await expect(page.getByRole('heading', { name: '重置邮件已发出' })).toBeVisible();

    const resetToken = await waitForMailToken(request, email, RESET_PASSWORD_SUBJECT);
    await page.goto(`/reset-password?token=${resetToken}`);
    await expect(page).toHaveURL(/\/reset-password$/);

    await page.getByLabel(/^新密码/).fill(NEW_PASSWORD);
    await page.getByLabel(/^确认新密码/).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: '重置密码' }).click();

    await expect(page.getByRole('heading', { name: '密码已重置' })).toBeVisible();
    await expect(page.getByText(/所有设备已登出/)).toBeVisible();

    await page.getByRole('link', { name: '去登录' }).click();
    await signIn(page, username, NEW_PASSWORD);
    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();
  });

  test('an unknown address yields the same anti-enumeration result', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/^邮箱/).fill(`nobody-${Date.now()}@example.com`);
    await page.getByRole('button', { name: '发送重置邮件' }).click();

    await expect(page.getByRole('heading', { name: '重置邮件已发出' })).toBeVisible();
    await expect(page.getByText(/如该邮箱已注册/)).toBeVisible();
  });

  test('an expired reset link is reported instead of silently failing', async ({ page }) => {
    await page.goto('/reset-password?token=this_token_was_never_issued');
    await page.getByLabel(/^新密码/).fill(NEW_PASSWORD);
    await page.getByLabel(/^确认新密码/).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: '重置密码' }).click();

    await expect(page.getByRole('heading', { name: '链接无效或已过期' })).toBeVisible();
    await expect(page.getByRole('link', { name: '重新申请' })).toBeVisible();
  });

  test('mismatched confirmation is caught before any request', async ({ page }) => {
    await page.goto('/reset-password?token=this_token_was_never_issued');
    await page.getByLabel(/^新密码/).fill(NEW_PASSWORD);
    await page.getByLabel(/^确认新密码/).fill('a-different-secret');
    await page.getByRole('button', { name: '重置密码' }).click();

    await expect(page.getByText('两次输入的密码不一致')).toBeVisible();
    await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible();
  });
});

test.describe('route guards', () => {
  test('an anonymous visitor is sent to /login and back after signing in', async ({
    page,
    request,
  }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fsecurity$/);

    await signIn(page, username, PASSWORD);
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByRole('heading', { name: '安全' })).toBeVisible();
  });

  test('an off-site next parameter is discarded', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

    await page.goto('/login?next=%2F%2Fevil.example%2Faccount');
    await signIn(page, username, PASSWORD);

    await expect(page).toHaveURL(/\/account$/);
    expect(page.url()).not.toContain('evil.example');
  });

  test('a signed-in visitor is kept out of the login page', async ({ page, request }) => {
    const username = uniqueUsername();
    const email = emailFor(username);
    await register(page, username, email);

    const token = await waitForMailToken(request, email, VERIFY_EMAIL_SUBJECT);
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: '邮箱验证成功' })).toBeVisible();

    await page.getByRole('link', { name: '去登录' }).click();
    await signIn(page, username, PASSWORD);
    await expect(page.getByRole('heading', { name: '概览' })).toBeVisible();

    await page.goto('/login');
    await expect(page).toHaveURL(/\/account$/);
  });
});
