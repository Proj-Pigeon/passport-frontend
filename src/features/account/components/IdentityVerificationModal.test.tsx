import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';
import type { MyIdentityResponse } from '@/api/endpoints/account/identity';
import { IdentityVerificationModal } from './IdentityVerificationModal';
import { DIDIT_ORIGIN, embeddedUrl } from './identityVerification';

const session = {
  id: 'kyc_test',
  session_id: 'session-test',
  session_url: 'https://verify.didit.me/session/test?existing=yes',
  expires_at: null,
};

describe('IdentityVerificationModal', () => {
  it('ignores foreign origins and unrelated frames, and refreshes only through the server', async () => {
    let resolveRefresh: (result: MyIdentityResponse) => void = () => undefined;
    const onRefresh = vi.fn(
      () =>
        new Promise<MyIdentityResponse>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const onClose = vi.fn();
    renderWithProviders(
      <IdentityVerificationModal session={session} onRefresh={onRefresh} onClose={onClose} />,
    );
    const iframe = screen.getByTitle('身份核验窗口') as HTMLIFrameElement;
    const send = (origin: string, source: Window | null) =>
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin,
            source,
            data: { type: 'didit:completed', data: { status: 'Approved' } },
          }),
        );
      });
    send('https://evil.example', iframe.contentWindow);
    send(DIDIT_ORIGIN, window);
    expect(onRefresh).not.toHaveBeenCalled();
    send(DIDIT_ORIGIN, iframe.contentWindow);
    send(DIDIT_ORIGIN, iframe.contentWindow);
    expect(onRefresh).toHaveBeenCalledExactlyOnceWith(session.id);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () =>
      resolveRefresh({ enabled: true, identity: null, reverification_request: null }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('keeps the window open when the server refresh fails', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <IdentityVerificationModal
        session={session}
        onRefresh={vi.fn().mockRejectedValue(new Error('Refresh failed'))}
        onClose={onClose}
      />,
    );
    const iframe = screen.getByTitle('身份核验窗口') as HTMLIFrameElement;
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: DIDIT_ORIGIN,
          source: iframe.contentWindow,
          data: { type: 'didit:completed' },
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText('发生未知错误，请稍后重试。')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('preserves session URL parameters and rejects untrusted hosts', () => {
    const embedded = new URL(embeddedUrl(session.session_url));
    expect(embedded.searchParams.get('existing')).toBe('yes');
    expect(embedded.searchParams.get('sdk_presentation')).toBe('embedded');
    expect(() => embeddedUrl('https://evil.example/')).toThrow();
  });
});
