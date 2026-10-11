import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

export const LANGUAGE_STORAGE_KEY = 'pp_locale';
export const DEFAULT_LANGUAGE = 'zh-CN';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === code);
}

function readStoredLanguage(): LanguageCode | null {
  try {
    return isSupportedLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
      ? (window.localStorage.getItem(LANGUAGE_STORAGE_KEY) as LanguageCode)
      : null;
  } catch {
    return null;
  }
}

function detectBrowserLanguage(): LanguageCode | null {
  const candidates = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue;
    }
    const normalized = candidate.replace('_', '-');
    if (isSupportedLanguage(normalized)) {
      return normalized;
    }
    const base = normalized.split('-')[0]?.toLowerCase();
    if (base === 'zh') {
      return 'zh-CN';
    }
    if (base === 'en') {
      return 'en';
    }
  }
  return null;
}

export function resolveInitialLanguage(): LanguageCode {
  return readStoredLanguage() ?? detectBrowserLanguage() ?? DEFAULT_LANGUAGE;
}

export function applyLanguage(code: LanguageCode): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // storage may be blocked; the in-memory language still applies
  }
  document.documentElement.lang = code;
  void i18n.changeLanguage(code);
}

if (!i18n.isInitialized) {
  const initialLanguage = resolveInitialLanguage();
  void i18n.use(initReactI18next).init({
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en },
    },
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
  });
  document.documentElement.lang = initialLanguage;
}

export default i18n;
