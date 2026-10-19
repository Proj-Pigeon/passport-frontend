import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ComplianceDocuments } from '@/api/types';
import i18n from '@/i18n';
import { renderWithProviders } from '@/test/render';

import { ComplianceConsent } from './ComplianceConsent';

describe('ComplianceConsent document rendering', () => {
  it.each(['terms', 'privacy', 'crossBorder'] as const)(
    'keeps %s free of raw HTML',
    async (key) => {
      const content =
        '# Policy\n\n**Readable**\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[Unsafe](javascript:alert%281%29)';
      const documents: ComplianceDocuments = {
        version: 1,
        terms_markdown: content,
        privacy_markdown: content,
        cross_border_enabled: true,
        cross_border_markdown: content,
        updated_at: '2026-10-19T00:00:00Z',
      };
      renderWithProviders(
        <ComplianceConsent documents={documents} checked={false} onChange={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: i18n.t(`compliance.${key}`) }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Policy' })).toBeInTheDocument();
      expect(within(dialog).getByText('Readable').tagName).toBe('STRONG');
      expect(dialog.querySelector('script, img, iframe, [onerror]')).toBeNull();
      expect(within(dialog).getByText('Unsafe')).toHaveAttribute('href', '');
    },
  );
});
