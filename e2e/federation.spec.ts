import { expect, test, type Page } from '@playwright/test';
import {
  createMockDb,
  seedUser,
  signIn,
  signInAdmin,
  grantAdminStepUp,
  seedAdminResource,
  adminResourceView,
} from '../src/test/mocks/db';
import { federationPresets, protocolInfo } from '../src/test/mocks/federationFixtures';

const requestId = 'srq_abcdefghijklmnopqrstuvwx';
async function fixture(page: Page, options: { authenticated?: boolean; providers?: boolean } = {}) {
  const db = createMockDb();
  const user = seedUser(db);
  if (options.authenticated) signIn(db, user, 'pwd');
  signInAdmin(db, user, ['super_admin']);
  grantAdminStepUp(db);
  const saml = seedAdminResource(db, {
    id: 'adr_saml',
    kind: 'saml',
    display_name: 'Example SAML',
    configuration: {
      entity_id: 'https://app.example/saml',
      acs_urls: [{ uri: 'https://app.example/saml/acs', binding: 'HTTP-POST', is_default: true }],
      allow_idp_initiated: false,
      certificates: [],
    },
  });
  const oidc = seedAdminResource(db, {
    id: 'adr_oidc',
    kind: 'oauth',
    display_name: 'Example OIDC',
    client_id: 'test-client',
    configuration: {
      redirect_uris: [{ uri: 'https://app.example/callback' }],
      scopes: ['openid', 'profile', 'email'],
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'none',
    },
  });
  const providers =
    options.providers === false
      ? []
      : [
          {
            slug: 'github',
            display_name: 'GitHub Corporate',
            provider_type: 'oauth2',
            icon: 'github',
          },
          {
            slug: 'partner-saml',
            display_name: 'Partner SAML Login',
            provider_type: 'saml',
            icon: 'saml',
          },
        ];
  await page.route(/\/(?:admin\/v1|v1|federation|saml)\//, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    if (path === '/federation/complete') return route.fallback();
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({ status, json: body, headers });
    if (path.endsWith('/auth/csrf')) return json({ token: 'browser-test-csrf' });
    if (path === '/v1/compliance-documents')
      return json({
        version: 1,
        terms_markdown: '# Terms',
        privacy_markdown: '# Privacy',
        cross_border_enabled: false,
        cross_border_markdown: '',
      });
    if (path === '/v1/federation/providers') return json({ providers });
    if (path === '/v1/sessions/current')
      return db.session
        ? json({ session: db.session, user })
        : json({ error: { code: 'unauthorized' } }, 401);
    if (path === '/v1/sessions/password') {
      signIn(db, user, 'pwd');
      return route.fulfill({ status: 204 });
    }
    if (path.startsWith('/saml/idp/sso/resume/'))
      return route.fulfill({ contentType: 'text/html', body: '<h1>SAML resumed</h1>' });
    if (path === '/federation/partner-saml/start')
      return route.fulfill({ contentType: 'text/html', body: '<h1>Upstream SAML started</h1>' });
    if (path === '/admin/v1/sessions/current') return json(db.adminSession);
    if (path === '/admin/v1/protocol-info')
      return json({
        ...protocolInfo,
        saml: { ...protocolInfo.saml, signing_certificate_fingerprint: 'ab:'.repeat(31) + 'ab' },
      });
    if (path === '/admin/v1/federation-providers/presets')
      return json({ presets: federationPresets });
    if (path === '/admin/v1/federation-providers' && method === 'POST') {
      const input = req.postDataJSON();
      const created = seedAdminResource(db, {
        id: 'adr_github',
        kind: 'federation',
        display_name: input.configuration.display_name,
        configuration: input.configuration,
      });
      return json(adminResourceView(created), 201);
    }
    if (path === '/admin/v1/federation-providers/adr_github/secrets') {
      expect(req.postDataJSON().secret).toBe('  browser-secret  ');
      const resource = db.adminResources.find((entry) => entry.id === 'adr_github')!;
      resource.secret_set = true;
      return json({ secret_set: true });
    }
    if (path === '/admin/v1/federation-providers')
      return json({
        items: db.adminResources
          .filter((entry) => entry.kind === 'federation')
          .map((entry) => adminResourceView(entry)),
        next_cursor: null,
      });
    if (path === '/admin/v1/saml-service-providers/adr_saml')
      return json(adminResourceView(saml), 200, { ETag: '"1"' });
    if (path === '/admin/v1/oauth-clients/adr_oidc')
      return json(adminResourceView(oidc), 200, { ETag: '"1"' });
    return json(
      { error: { code: 'not_found', message: `Unexpected test API: ${method} ${path}` } },
      404,
    );
  });
  return db;
}
async function expectNoPageOverflow(page: Page) {
  const bounds = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport + 1);
  expect(bounds.body).toBeLessThanOrEqual(bounds.viewport + 1);
}

test('dynamic login providers and a top-level upstream SAML navigation at 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.goto(`/login?saml_request=${requestId}`);
  await expect(page.getByRole('link', { name: 'GitHub Corporate' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Partner SAML Login' })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('link', { name: 'Partner SAML Login' }).click();
  await expect(page.getByRole('heading', { name: 'Upstream SAML started' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('passport.samlRequest'))).toBe(requestId);
});

test('password login resumes SAML and permits fresh login with an existing session', async ({
  page,
}) => {
  await fixture(page, { authenticated: true });
  await page.goto(`/login?saml_request=${requestId}&reauth=required`);
  await expect(page.getByRole('link', { name: 'Partner SAML Login' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
  await page.getByLabel(/^用户名或邮箱/).fill('alice');
  await page.getByLabel(/^密码/).fill('correct-horse-battery');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/saml/idp/sso/resume/${requestId}$`));
  await expect(page.getByRole('heading', { name: 'SAML resumed' })).toBeVisible();
});

test('federation completion restores the pending SAML request once', async ({ page }) => {
  await fixture(page, { authenticated: true });
  await page.goto('/login');
  await page.evaluate((id) => sessionStorage.setItem('passport.samlRequest', id), requestId);
  await page.goto('/federation/complete?result=success');
  await expect(page).toHaveURL(new RegExp(`/saml/idp/sso/resume/${requestId}$`));
  expect(await page.evaluate(() => sessionStorage.getItem('passport.samlRequest'))).toBeNull();
});

test('preset wizard creates one draft and stores its secret separately at 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await fixture(page);
  await page.goto('/admin/federation-providers');
  await page.getByRole('button', { name: '创建草稿' }).click();
  await page.getByRole('button', { name: /GitHub.*OAUTH2/ }).click();
  await page.getByLabel(/^显示名称/).fill('GitHub Corporate');
  await page.getByLabel(/^Client ID/).fill('test-client');
  await page.getByLabel(/^Client Secret/).fill('  browser-secret  ');
  await page.getByLabel(/^操作原因/).fill('Browser acceptance');
  await expectNoPageOverflow(page);
  await page.getByRole('button', { name: '创建草稿', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('link', { name: 'GitHub Corporate', exact: true })).toBeVisible();
  expect(db.adminResources.filter((entry) => entry.kind === 'federation')).toHaveLength(1);
  expect(JSON.stringify(db.adminResources)).not.toContain('browser-secret');
});

test('separate OIDC and SAML guides fit desktop and 320px with a certificate download', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/admin/saml-service-providers/adr_saml');
  await expect(page.getByText('SAML 接入指南', { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await expectNoPageOverflow(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载签名证书' }).click();
  expect((await download).suggestedFilename()).toBe('passport-idp-certificate.pem');
  await page.screenshot({ path: '.validation/saml-guide-mobile.png', fullPage: true });
  await page.goto('/admin/oauth-clients/adr_oidc');
  await expect(page.getByText('OIDC 接入指南', { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await expect(page.getByText('SAML 接入指南', { exact: true })).toHaveCount(0);
});
