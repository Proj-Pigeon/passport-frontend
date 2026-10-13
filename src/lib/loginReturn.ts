import { apiUrl } from '@/api/http';
import { nextFromSearchParams } from './safeNext';
import { openTopLevel } from './topLevelNavigation';

const STORAGE_KEY = 'passport.samlRequest';
const REQUEST_ID = /^srq_[A-Za-z0-9_-]{16,60}$/;

export function samlRequestFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('saml_request');
  return value && REQUEST_ID.test(value) ? value : null;
}

export function rememberSamlRequest(search: string) {
  const request = samlRequestFromSearch(search);
  if (request) {
    sessionStorage.setItem(STORAGE_KEY, request);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function completeLogin(
  search: string,
  navigate: (path: string, options: { replace: boolean }) => void,
  restoreFederation = false,
) {
  const saved = restoreFederation ? sessionStorage.getItem(STORAGE_KEY) : null;
  const request = samlRequestFromSearch(search) ?? saved;
  sessionStorage.removeItem(STORAGE_KEY);
  if (request) {
    openTopLevel(apiUrl(`/saml/idp/sso/resume/${encodeURIComponent(request)}`));
    return;
  }
  navigate(nextFromSearchParams(search) ?? '/account', { replace: true });
}
