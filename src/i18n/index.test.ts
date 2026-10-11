import { describe, expect, it } from 'vitest';

import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from './index';

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
});

function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}
