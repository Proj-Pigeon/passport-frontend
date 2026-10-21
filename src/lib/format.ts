import i18n from '@/i18n';

const LOCALE_BY_LANGUAGE: Record<string, string> = {
  'zh-CN': 'zh-CN',
  en: 'en-US',
};

function currentLocale(): string {
  const language = i18n.language;
  return LOCALE_BY_LANGUAGE[language] ?? language ?? 'zh-CN';
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined): string | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  const digits = exponent === 0 ? 0 : value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[exponent]}`;
}

export function secondsUntil(value: string | null | undefined, now = Date.now()): number {
  const date = parseDate(value);
  if (!date) {
    return 0;
  }
  return Math.max(0, Math.ceil((date.getTime() - now) / 1000));
}
