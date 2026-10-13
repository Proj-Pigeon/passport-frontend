import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeLogin, rememberSamlRequest, samlRequestFromSearch } from './loginReturn';
import { openTopLevel } from './topLevelNavigation';
vi.mock('./topLevelNavigation', () => ({ openTopLevel: vi.fn() }));
const request = 'srq_1234567890abcdefghijklmnop';
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
describe('SAML login return', () => {
  it('resumes only an opaque request on the API origin', () => {
    const navigate = vi.fn();
    completeLogin(`?saml_request=${request}&next=https://evil.example`, navigate);
    expect(openTopLevel).toHaveBeenCalledWith(`/saml/idp/sso/resume/${request}`);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('restores the request after upstream federation exactly once', () => {
    const navigate = vi.fn();
    rememberSamlRequest(`?saml_request=${request}`);
    completeLogin('?result=success', navigate, true);
    expect(openTopLevel).toHaveBeenCalledOnce();
    completeLogin('?result=success', navigate, true);
    expect(navigate).toHaveBeenCalledWith('/account', { replace: true });
  });
  it('rejects arbitrary resume URLs and clears stale state for unrelated logins', () => {
    expect(samlRequestFromSearch('?saml_request=https://evil.example')).toBeNull();
    rememberSamlRequest(`?saml_request=${request}`);
    rememberSamlRequest('');
    const navigate = vi.fn();
    completeLogin('?result=success', navigate, true);
    expect(openTopLevel).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/account', { replace: true });
  });
});
