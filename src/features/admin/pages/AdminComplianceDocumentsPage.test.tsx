import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { grantAdminStepUp, seedUser, signInAdmin } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

describe('AdminComplianceDocumentsPage HTML safety', () => {
  it('keeps all legal drafts as textarea values without rendering raw HTML', async () => {
    const content = '# Policy\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">';
    signInAdmin(mockDb, seedUser(mockDb), ['super_admin']);
    grantAdminStepUp(mockDb);
    server.use(
      http.get('*/admin/v1/compliance-documents', () =>
        HttpResponse.json({
          version: 1,
          terms_markdown: content,
          privacy_markdown: content,
          cross_border_markdown: content,
          cross_border_enabled: true,
          updated_at: '2026-10-19T00:00:00Z',
        }),
      ),
    );
    renderRoute(['/admin/compliance-documents']);
    const editors = await screen.findAllByRole('textbox');
    await waitFor(() =>
      expect(editors.filter((node) => node instanceof HTMLTextAreaElement)).toHaveLength(3),
    );
    const drafts = editors.filter((node) => node instanceof HTMLTextAreaElement);
    for (const editor of drafts) {
      await waitFor(() => expect(editor).toHaveValue(content));
      fireEvent.change(editor, {
        target: { value: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
      });
    }
    expect(document.querySelector('script, img[onerror], iframe[srcdoc]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Policy' })).toBeNull();
  });
});
