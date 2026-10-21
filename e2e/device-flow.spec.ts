import { randomBytes } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { requireBackend } from './helpers';

const clientId = process.env.PASSPORT_E2E_DEVICE_CLIENT_ID;
const username = process.env.PASSPORT_E2E_USERNAME;
const password = process.env.PASSPORT_E2E_PASSWORD;
const adminUsername = process.env.PASSPORT_E2E_ADMIN_USERNAME;

async function login(page: Page, identifier: string, admin = false, next?: string) {
  await page.goto(next ?? (admin ? '/admin/login' : '/login'));
  if (next) await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel(/用户名或邮箱/).fill(identifier);
  await page.getByLabel(/^密码/).fill(password!);
  if (!admin) await page.getByRole('checkbox').check();
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(next ?? (admin ? /\/admin$/ : /\/account$/));
}

async function authorization(request: APIRequestContext, name: string) {
  const response = await request.post('/oauth2/device_authorization', {
    form: {
      client_id: clientId!,
      scope: 'openid profile email',
      installation_id: randomBytes(32).toString('base64url'),
      device_name: name,
      platform: 'windows',
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    user_code: string;
    device_code: string;
    verification_uri_complete: string;
  };
}

async function approve(page: Page, uri: string, verifyPassword = false) {
  await page.goto(uri);
  await expect(page.getByText('GuEarth E2E', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批准登录' }).click();
  if (verifyPassword) {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '密码', exact: true }).fill(password!);
    await dialog.getByRole('button', { name: '验证密码', exact: true }).click();
  }
  await expect(page.getByText('设备已授权，请返回应用完成登录。')).toBeVisible();
}

async function exchange(request: APIRequestContext, deviceCode: string) {
  const response = await request.post('/oauth2/token', {
    form: {
      client_id: clientId!,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { access_token: string; refresh_token: string };
}

async function expectNoOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
}

test('device login, userinfo, refresh, user/admin revoke and current browser exit', async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.skip(
    !clientId || !username || !password || !adminUsername,
    'Requires isolated device fixtures',
  );
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  await requireBackend(request);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const first = await authorization(request, 'GuEarth desktop');
  await login(page, username!, false, first.verification_uri_complete);
  const current = await page.request.get('/v1/sessions/current');
  expect(current.status()).toBe(200);
  const userId = ((await current.json()) as { user: { id: string } }).user.id;
  await page.goto(first.verification_uri_complete);
  await expect(page).toHaveURL(/\/device\/confirm\?user_code=/);
  await expect(page.getByText('GuEarth E2E', { exact: true })).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('device-desktop.png'), fullPage: true });
  await approve(page, first.verification_uri_complete, true);
  const issued = await exchange(request, first.device_code);
  const info = await request.get('/oauth2/userinfo', {
    headers: { Authorization: `Bearer ${issued.access_token}` },
  });
  expect(info.status()).toBe(200);
  expect((await info.json()) as { sub: string }).toHaveProperty('sub');
  const refresh = await request.post('/oauth2/token', {
    form: {
      grant_type: 'refresh_token',
      client_id: clientId!,
      refresh_token: issued.refresh_token,
    },
  });
  expect(refresh.status()).toBe(200);
  const rotated = (await refresh.json()) as { refresh_token: string; access_token: string };
  expect(rotated.refresh_token).not.toBe(issued.refresh_token);
  await page.goto('/account/security');
  await expect(page.getByText('GuEarth desktop', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('devices-mobile.png'), fullPage: true });
  const card = page
    .locator('.mantine-Paper-root')
    .filter({
      has: page.getByText('GuEarth desktop', { exact: true }),
    })
    .last();
  await card.getByRole('button', { name: '撤销访问', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '撤销访问', exact: true }).click();
  await expect(page.getByText('GuEarth desktop', { exact: true })).not.toBeVisible();
  expect(
    (
      await request.get('/oauth2/userinfo', {
        headers: { Authorization: `Bearer ${rotated.access_token}` },
      })
    ).status(),
  ).toBe(401);

  const second = await authorization(request, 'GuEarth admin-revoked');
  await approve(page, second.verification_uri_complete);
  const secondTokens = await exchange(request, second.device_code);
  const adminContext = await browser.newContext({
    locale: 'zh-CN',
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const admin = await adminContext.newPage();
    admin.on('pageerror', (error) => errors.push(error.message));
    admin.setDefaultTimeout(10_000);
    await login(admin, adminUsername!);
    const cdp = await adminContext.newCDPSession(admin);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
    await admin.goto('/account/security');
    await admin.getByRole('button', { name: '添加第一个通行密钥' }).click();
    await expect(admin.getByText('通行密钥已添加')).toBeVisible();
    await login(admin, adminUsername!, true);
    await admin.goto(`/admin/users/${userId}`);
    const adminCard = admin
      .locator('.mantine-Paper-root')
      .filter({
        has: admin.getByText('GuEarth admin-revoked', { exact: true }),
      })
      .last();
    await adminCard.getByRole('button', { name: '撤销访问', exact: true }).click();
    await admin
      .getByRole('dialog')
      .getByLabel(/^操作原因/)
      .fill('E2E lost device');
    await admin.getByRole('dialog').getByRole('button', { name: '撤销访问', exact: true }).click();
    await admin.getByRole('button', { name: '验证通行密钥', exact: true }).click();
    await expect(admin.getByText('GuEarth admin-revoked', { exact: true })).not.toBeVisible();
    expect(
      (
        await request.get('/oauth2/userinfo', {
          headers: { Authorization: `Bearer ${secondTokens.access_token}` },
        })
      ).status(),
    ).toBe(401);
    await admin.screenshot({ path: testInfo.outputPath('admin-devices.png'), fullPage: true });
  } finally {
    await adminContext.close();
  }
  const logout = await authorization(request, 'GuEarth client logout');
  await approve(page, logout.verification_uri_complete);
  const logoutTokens = await exchange(request, logout.device_code);
  const revoked = await request.post('/oauth2/revoke', {
    form: {
      client_id: clientId!,
      token: logoutTokens.refresh_token,
      token_type_hint: 'refresh_token',
    },
  });
  expect(revoked.status()).toBe(200);
  expect(
    (
      await request.get('/oauth2/userinfo', {
        headers: { Authorization: `Bearer ${logoutTokens.access_token}` },
      })
    ).status(),
  ).toBe(401);
  await page.goto('/account/security');
  await expect(page.getByText('GuEarth client logout', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '撤销并退出' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '撤销访问', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/v1/sessions/current')).status()).toBe(401);
  expect(errors).toEqual([]);
});
