import { expect, test } from '@playwright/test';

test.describe('shell', () => {
  test('unknown route renders the 404 page', async ({ page }) => {
    await page.goto('/nope');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByText('页面不存在')).toBeVisible();
  });

  test('color scheme toggle flips data-mantine-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');

    await page.getByRole('button', { name: '切换到深色模式' }).click();
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');

    await page.getByRole('button', { name: '切换到浅色模式' }).click();
    await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');
  });

  test('language switch translates the login page and persists', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    await page.getByRole('button', { name: '语言' }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('login page links to registration and password recovery', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    await page.getByRole('link', { name: '创建账号' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: '创建账号' })).toBeVisible();

    await page.goBack();
    await page.getByRole('link', { name: '忘记密码？' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test('form fields carry autocomplete hints for password managers', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();

    await expect(page.getByLabel(/^用户名或邮箱/)).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel(/^密码/)).toHaveAttribute('autocomplete', 'current-password');
  });

  test('registration advertises the new-password autocomplete', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: '创建账号' })).toBeVisible();

    await expect(page.getByLabel(/^密码/)).toHaveAttribute('autocomplete', 'new-password');
  });
});
