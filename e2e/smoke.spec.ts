import { expect, test } from '@playwright/test';

test('root redirects to /account placeholder', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: '账号概览' })).toBeVisible();
});

test('color scheme toggle flips data-mantine-color-scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/account');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');

  await page.getByRole('button', { name: '切换到深色模式' }).click();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
});

test('unknown route shows 404', async ({ page }) => {
  await page.goto('/nope');
  await expect(page.getByText('页面不存在')).toBeVisible();
});
