const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const root = resolve(__dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  });
}

test('all Markdown renderers use the closed, raw-HTML-free component', () => {
  const renderers = [];
  for (const path of sourceFiles(join(root, 'src'))) {
    if (/\.(test|spec)\./.test(path)) continue;
    const source = readFileSync(path, 'utf8');
    const file = relative(root, path).replaceAll('\\', '/');
    assert.doesNotMatch(source, /rehype-raw|dangerouslySetInnerHTML/, file);
    if (/['"]react-markdown['"]/.test(source)) renderers.push(file);
  }
  assert.deepEqual(renderers, ['src/components/SafeMarkdown.tsx']);
  const source = ts.createSourceFile(
    'SafeMarkdown.tsx',
    read('src/components/SafeMarkdown.tsx'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const elements = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === 'ReactMarkdown') {
      elements.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(elements.length, 1);
  assert.deepEqual(
    elements[0].attributes.properties.map((property) => property.getText(source)),
    ['skipHtml'],
  );
  assert.doesNotMatch(read('package.json'), /rehype-raw/);
  assert.doesNotMatch(read('pnpm-lock.yaml'), /rehype-raw/);
  assert.match(read('src/features/auth/components/ComplianceConsent.tsx'), /<SafeMarkdown>/);
});

test('Vitest bounds workers and grants slow interactions 20 seconds', () => {
  const config = read('vite.config.ts');
  assert.match(config, /maxWorkers:\s*1\b/);
  assert.match(config, /testTimeout:\s*20_000\b/);
});

test('the shipped image includes headers at every nginx add_header scope', () => {
  const config = read('nginx.prod.conf');
  assert.equal((config.match(/include \/etc\/nginx\/security-headers\.conf;/g) ?? []).length, 4);
  assert.match(
    read('Dockerfile'),
    /COPY[^\n]*nginx\.security-headers\.conf \/etc\/nginx\/security-headers\.conf/,
  );
  const headers = read('nginx.security-headers.conf');
  for (const name of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
  ]) {
    assert.match(headers, new RegExp(`add_header ${name} "[^"\\n]+" always;`));
  }
  assert.match(headers, /script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
  assert.match(headers, /frame-src https:\/\/challenges\.cloudflare\.com;/);
  assert.match(headers, /style-src 'self' 'unsafe-inline';/);
  assert.match(headers, /connect-src 'self' https: http: wss: ws:;/);
  assert.match(headers, /font-src 'self' data: https:;/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.doesNotMatch(headers, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
});
