import { describe, expect, it } from 'vitest';

import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from './index';

const LITERAL_KEY = /(?:^|[^\w$])t\(\s*(["'])((?:(?!\1)[^\n])*)\1\s*[,)]/g;

describe('i18n configuration', () => {
  it('keeps the storage key in sync with the test bootstrap', () => {
    expect(LANGUAGE_STORAGE_KEY).toBe('pp_locale');
  });

  it('defaults to Simplified Chinese and offers English', () => {
    expect(DEFAULT_LANGUAGE).toBe('zh-CN');
    expect(SUPPORTED_LANGUAGES.map((language) => language.code)).toEqual(['zh-CN', 'en']);
  });

  it('has matching key trees for every supported language', async () => {
    const zhCN = (await import('./locales/zh-CN.json')).default;
    const en = (await import('./locales/en.json')).default;
    expect(collectKeys(en)).toEqual(collectKeys(zhCN));
  });

  it('defines every key referenced by a literal t() call', async () => {
    const zhCN = (await import('./locales/zh-CN.json')).default;
    const en = (await import('./locales/en.json')).default;
    const zhKeys = new Set(collectKeys(zhCN));
    const enKeys = new Set(collectKeys(en));
    const missing = [...referencedKeys()].flatMap(([key, file]) =>
      zhKeys.has(key) && enKeys.has(key) ? [] : [`${key} referenced by ${file}`],
    );
    expect(missing).toEqual([]);
  });
});

function referencedKeys(): Map<string, string> {
  const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const found = new Map<string, string>();
  for (const [file, source] of Object.entries(sources)) {
    if (file.includes('.test.')) {
      continue;
    }
    for (const match of source.matchAll(LITERAL_KEY)) {
      if (match[2] && !found.has(match[2])) {
        found.set(match[2], file);
      }
    }
  }
  return found;
}

function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}
