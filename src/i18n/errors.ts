import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

import { errorI18nKey, fieldErrorI18nKey, isApiError, type ApiError } from '@/api/errors';
import i18n from '@/i18n';

const TRANSLATABLE_PREFIXES = ['validation.', 'errors.'] as const;

export function isTranslationKey(value: string): boolean {
  return TRANSLATABLE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function describeApiError(error: unknown): string {
  const fallback = i18n.t('errors.generic');
  if (!isApiError(error)) {
    return fallback;
  }
  return i18n.t(errorI18nKey(error.code), { defaultValue: fallback });
}

export function describeFieldError(error: ApiError, field: string): string | undefined {
  const code = error.fieldCode(field);
  if (!code) {
    return undefined;
  }
  return i18n.t(fieldErrorI18nKey(field, code), { defaultValue: i18n.t('errors.generic') });
}

export function fieldErrorsFromApiError(error: ApiError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of error.fields) {
    const message = describeFieldError(error, field.name);
    if (message) {
      errors[field.name] = message;
    }
  }
  return errors;
}

export function useFieldErrorText(): (value: ReactNode) => ReactNode {
  const { t } = useTranslation();
  return useCallback(
    (value: ReactNode): ReactNode => {
      if (typeof value !== 'string' || value.length === 0) {
        return value;
      }
      return isTranslationKey(value) ? t(value) : value;
    },
    [t],
  );
}
