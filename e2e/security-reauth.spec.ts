import { expect, test } from '@playwright/test';

for (const stage of ['fetch', 'approve'] as const) {
  test(`OAuth ${stage} reauthentication preserves the interaction and renders legal text safely`, async ({
    page,
  }) => {
    let authenticatedAgain = false;
    let reauthRequests = 0;
    let passwordRequests = 0;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const next = '/authorize?interaction=int_security';
    const legal =
      '# Policy\n\n**Readable**\n\n<script>window.legalInjected=true</script>\n\n<img src=x onerror="window.legalInjected=true">';
    const expires = new Date(Date.now() + 3_600_000).toISOString();
    await page.route('**/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/v1/sessions/current') {
        await route.fulfill({
          json: {
            session: {
              id: 'session_old',
              auth_time: new Date().toISOString(),
              amr: ['pwd'],
              acr: null,
              idle_expires_at: expires,
              expires_at: expires,
            },
            user: {
              id: 'usr_security',
              username: 'alice',
              display_name: 'Alice',
              email: 'alice@example.test',
              status: 'active',
              email_verified: true,
              has_password: true,
              has_passkey: true,
              step_up_required: false,
            },
          },
        });
      } else if (path === '/v1/auth/csrf') {
        await route.fulfill({ json: { token: 'csrf_security' } });
      } else if (path === '/v1/compliance-documents') {
        await route.fulfill({
          json: {
            version: 7,
            terms_markdown: legal,
            privacy_markdown: '# Privacy',
            cross_border_enabled: false,
            cross_border_markdown: '',
            updated_at: new Date().toISOString(),
          },
        });
      } else if (path === '/v1/federation/providers') {
        await route.fulfill({
          json: {
            providers: [
              { slug: 'oidc', display_name: 'OIDC Provider', provider_type: 'oidc' },
              { slug: 'saml', display_name: 'SAML Provider', provider_type: 'saml' },
              { slug: 'oauth2', display_name: 'OAuth2 Provider', provider_type: 'oauth2' },
            ],
          },
        });
      } else if (path === '/v1/sessions/password') {
        passwordRequests++;
        expect(request.postDataJSON()).toEqual({
          identifier: 'alice',
          password: 'correct-horse-battery',
          compliance_versions: { terms: 7, privacy: 7 },
        });
        expect(request.headers()['x-csrf-token']).toBe('csrf_security');
        authenticatedAgain = true;
        await route.fulfill({ status: 204 });
      } else {
        throw new Error(`Unexpected API request: ${request.method()} ${path}`);
      }
    });
    await page.route('**/oauth2/authorize/interactions/**', async (route) => {
      const request = route.request();
      const isApprove = new URL(request.url()).pathname.endsWith('/approve');
      if (!authenticatedAgain && (stage === 'fetch' || isApprove)) {
        reauthRequests++;
        await route.fulfill({
          status: 403,
          json: {
            error: {
              code: 'login_required',
              message: 'Authenticate again to continue authorization.',
            },
            login_url: `${new URL(page.url()).origin}/login?reauth=required&next=${encodeURIComponent(next)}`,
          },
        });
      } else {
        await route.fulfill({
          json: {
            interaction_id: 'int_security',
            client_id: 'client_security',
            client_name: 'Security Client',
            scopes: ['openid'],
            expires_at: expires,
          },
        });
      }
    });
    await page.goto(next);
    if (stage === 'approve') await page.getByRole('button', { name: '允许', exact: true }).click();
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible();
    const login = new URL(page.url());
    expect(login.searchParams.get('reauth')).toBe('required');
    expect(login.searchParams.get('next')).toBe(next);
    for (const name of ['OIDC Provider', 'SAML Provider']) {
      const link = page.getByRole('link', { name: `使用 ${name} 继续` });
      await expect(link).toBeVisible();
      const start = new URL((await link.getAttribute('href'))!, login.origin);
      expect(start.searchParams.get('reauth')).toBe('required');
      expect(start.searchParams.get('next')).toBe(next);
    }
    await expect(page.getByRole('link', { name: '使用 OAuth2 Provider 继续' })).toHaveCount(0);
    await page.getByRole('button', { name: '《用户协议》' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Policy' })).toBeVisible();
    await expect(dialog.locator('strong')).toHaveText('Readable');
    await expect(dialog.locator('script, img, iframe, [onerror]')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, 'legalInjected'))).toBeUndefined();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('checkbox').check();
    await page.getByLabel('用户名或邮箱', { exact: false }).fill('alice');
    await page.getByLabel('密码', { exact: false }).fill('correct-horse-battery');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/authorize\\?interaction=int_security$'));
    await expect(page.getByRole('button', { name: '允许', exact: true })).toBeEnabled();
    expect(passwordRequests).toBe(1);
    expect(reauthRequests).toBe(1);
    expect(errors).toEqual([]);
  });
}
