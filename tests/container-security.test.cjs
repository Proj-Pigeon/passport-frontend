const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('@playwright/test');

const root = resolve(__dirname, '..');
const image = 'nginxinc/nginx-unprivileged:alpine';
const variables = {
  VITE_API_BASE: 'apiBase',
  VITE_ADMIN_ORIGIN: 'adminBase',
  VITE_ACCOUNT_ORIGIN: 'accountBase',
  VITE_TURNSTILE_SITE_KEY: 'turnstileSiteKey',
  VITE_TURNSTILE_ACTION: 'turnstileAction',
};
const mount = (source, target) => [
  '--mount',
  `type=bind,source=${resolve(root, source)},target=${target},readonly`,
];

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options,
  }).trim();
}

function runtimeConfig(env) {
  return docker(
    [
      'run',
      '--rm',
      '--tmpfs',
      '/usr/share/nginx/html:uid=101,gid=101',
      '--entrypoint',
      'sh',
      ...mount('docker-entrypoint.d/40-runtime-config.sh', '/runtime-config.sh'),
      ...Object.keys(variables).flatMap((name) => ['-e', name]),
      image,
      '-c',
      'sh -n /runtime-config.sh && sh /runtime-config.sh && cat /usr/share/nginx/html/config.js',
    ],
    {
      env: {
        ...process.env,
        ...Object.fromEntries(Object.keys(variables).map((n) => [n, ''])),
        ...env,
      },
    },
  );
}

test('the production shell serializes every runtime field losslessly without code execution', () => {
  const payloads = [
    'https://api.example.test/v1?x=1&y=2',
    '";globalThis.injected=true;//\\',
    '</script><script>globalThis.injected=true</script><!-- -->',
    Array.from({ length: 31 }, (_, i) => String.fromCharCode(i + 1)).join('') + '\x7f',
    'Unicode: \u4e2d\u6587 \ud83d\udd12 \u2028 \u2029 e\u0301\n\n',
  ];
  for (const payload of payloads) {
    const code = runtimeConfig(Object.fromEntries(Object.keys(variables).map((n) => [n, payload])));
    assert.doesNotMatch(code, /[<>&\x00-\x1f\x7f\u2028\u2029]/);
    const context = { window: {} };
    runInNewContext(code, context, { timeout: 1000 });
    assert.equal(context.injected, undefined);
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.window.__PASSPORT_CONFIG__)),
      Object.fromEntries(Object.values(variables).map((name) => [name, payload])),
    );
    assert.deepEqual(
      JSON.parse(code.slice(code.indexOf('{'), -1)),
      JSON.parse(JSON.stringify(context.window.__PASSPORT_CONFIG__)),
    );
  }
});

test('the production shell preserves empty defaults and the default Turnstile action', () => {
  const context = { window: {} };
  runInNewContext(runtimeConfig({}), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.__PASSPORT_CONFIG__)), {
    apiBase: '',
    adminBase: '',
    accountBase: '',
    turnstileSiteKey: '',
    turnstileAction: 'auth',
  });
});

test('nginx serves security headers on documents, config, assets, fallback and errors', async () => {
  let id;
  try {
    id = docker([
      'run',
      '--rm',
      '--tmpfs',
      '/usr/share/nginx/html:uid=101,gid=101',
      '-d',
      '-p',
      '127.0.0.1::8080',
      '--entrypoint',
      'sh',
      ...mount('nginx.prod.conf', '/etc/nginx/conf.d/default.conf'),
      ...mount('nginx.security-headers.conf', '/etc/nginx/security-headers.conf'),
      ...mount('docker-entrypoint.d/40-runtime-config.sh', '/runtime-config.sh'),
      ...mount('dist', '/fixture'),
      image,
      '-c',
      'cp -R /fixture/. /usr/share/nginx/html/ && sh /runtime-config.sh && nginx -t && exec nginx -g "daemon off;"',
    ]);
    const port = docker(['port', id, '8080/tcp']).split(':').at(-1);
    const base = `http://127.0.0.1:${port}`;
    let index;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        index = await fetch(`${base}/index.html`).then((r) => r.text());
        break;
      } catch (error) {
        if (attempt === 39) throw new Error(docker(['logs', id]), { cause: error });
        await delay(250);
      }
    }
    const asset = index.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
    const cases = [
      ['/', 200, 'no-cache'],
      ['/index.html', 200, 'no-cache'],
      ['/config.js', 200, 'no-store'],
      [asset, 200, 'public, max-age=31536000, immutable'],
      ['/account/security', 200, 'no-cache'],
      ['/assets/missing.js', 404, null],
    ];
    for (const [path, status, cache] of cases) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, status, path);
      assert.equal(response.headers.get('cache-control'), cache, path);
      assert.equal(response.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(
        response.headers.get('referrer-policy'),
        'strict-origin-when-cross-origin',
        path,
      );
      assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000', path);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
      if (path === '/config.js') {
        assert.match(response.headers.get('content-type'), /javascript/);
      }
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/v1/session', (route) =>
        route.fulfill({
          status: 401,
          json: { error: { code: 'unauthorized' } },
        }),
      );
      await page.route('**/v1/sessions/current', (route) =>
        route.fulfill({
          status: 401,
          json: { error: { code: 'unauthorized' } },
        }),
      );
      await page.route('**/v1/compliance-documents', (route) =>
        route.fulfill({
          json: {
            version: 1,
            terms_markdown: '# Policy\n\n**Readable**\n\n<img src=x onerror="alert(1)">',
            privacy_markdown: '# Privacy',
            cross_border_enabled: false,
            cross_border_markdown: '',
            updated_at: '2026-10-19T00:00:00Z',
          },
        }),
      );
      await page.route('**/v1/federation/providers', (route) =>
        route.fulfill({ json: { providers: [] } }),
      );
      await page.goto(`${base}/login`);
      await page.getByRole('heading', { name: '登录', exact: true }).waitFor();
      assert.equal(await page.title(), '\u767b\u5f55 \u00b7 Pigeon Passport');
      await page.getByRole('button', { name: '《用户协议》' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: 'Policy', exact: true }).waitFor();
      assert.equal(await dialog.locator('strong').textContent(), 'Readable');
      assert.equal(await dialog.locator('img[onerror], script, iframe').count(), 0);
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.deepEqual(errors, []);

      const response = await fetch(`${base}/index.html`);
      const headers = Object.fromEntries(response.headers);
      const payload = '</script><script>globalThis.injected=true</script>';
      await page.route(`${base}/legacy-config.js`, (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `window.externalPayload=${JSON.stringify(payload)};`,
        }),
      );
      await page.route(`${base}/external-context`, (route) =>
        route.fulfill({
          headers,
          body: '<!doctype html><script src="/legacy-config.js"></script><script>window.inlineInjected=true</script><div id="proof">Loaded</div>',
        }),
      );
      await page.goto(`${base}/external-context`);
      assert.equal(await page.locator('#proof').textContent(), 'Loaded');
      assert.equal(await page.evaluate(() => window.externalPayload), payload);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      assert.equal(await page.evaluate(() => window.inlineInjected), undefined);
      await page.route('https://challenges.cloudflare.com/**', (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'window.turnstileScriptAllowed=true;',
        }),
      );
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.append(script);
          }),
      );
      assert.equal(await page.evaluate(() => window.turnstileScriptAllowed), true);
      await page.route('https://api.example.test/**', (route) =>
        route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: { connected: true },
        }),
      );
      assert.deepEqual(
        await page.evaluate(() => fetch('https://api.example.test/proof').then((r) => r.json())),
        { connected: true },
      );
      await page.routeWebSocket('wss://socket.example.test/proof', (socket) => {
        socket.onMessage(() => socket.send('connected'));
      });
      assert.equal(
        await page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              const socket = new WebSocket('wss://socket.example.test/proof');
              socket.onopen = () => socket.send('hello');
              socket.onmessage = (event) => {
                socket.close();
                resolve(event.data);
              };
              socket.onerror = reject;
            }),
        ),
        'connected',
      );
      const fontRequests = [];
      await page.route('https://fonts.example.test/proof.woff2', (route) => {
        fontRequests.push(route.request().url());
        return route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'font/woff2',
          body: 'font-fixture',
        });
      });
      await page.evaluate(async () => {
        const font = new FontFace('HeaderProof', 'url(https://fonts.example.test/proof.woff2)');
        await font.load().catch(() => {});
      });
      assert.deepEqual(fontRequests, ['https://fonts.example.test/proof.woff2']);
      await page.route('https://challenges.cloudflare.com/frame-proof', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<title>Turnstile frame proof</title>',
        }),
      );
      await page.evaluate(() => {
        const frame = document.createElement('iframe');
        frame.src = 'https://challenges.cloudflare.com/frame-proof';
        document.body.append(frame);
      });
      await page.frameLocator('iframe').locator('title').waitFor({ state: 'attached' });
    } finally {
      await browser.close();
    }
  } finally {
    if (id) docker(['stop', id]);
  }
});
