import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('preserves headings, emphasis, lists and safe links', () => {
    render(
      <SafeMarkdown>
        {'# Policy\n\n**Important**\n\n- First\n- Second\n\n[Details](https://example.test/policy)'}
      </SafeMarkdown>,
    );
    expect(screen.getByRole('heading', { name: 'Policy', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Important').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      'https://example.test/policy',
    );
  });

  it.each([
    '<script>globalThis.injected = true</script>',
    '<img src=x onerror="alert(1)">',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<svg><a xlink:href="javascript:alert(1)">click</a></svg>',
    '<form action="https://evil.test"><input autofocus onfocus="alert(1)"></form>',
    '<style>body { display: none }</style>',
    '<!-- comment --><object data="data:text/html,evil"></object>',
  ])('never creates raw HTML nodes from %s', (payload) => {
    const { container } = render(<SafeMarkdown>{`# Policy\n\n${payload}`}</SafeMarkdown>);
    expect(screen.getByRole('heading', { name: 'Policy' })).toBeInTheDocument();
    expect(
      container.querySelector('script, img, iframe, svg, form, input, style, object'),
    ).toBeNull();
    expect(container.querySelector('[onerror], [onfocus], [srcdoc]')).toBeNull();
    expect(container.textContent).not.toContain(payload);
  });

  it.each([
    'javascript:alert%281%29',
    'JaVaScRiPt:alert%281%29',
    'javascript&#58;alert%281%29',
    'data:text/html,evil',
    'vbscript:evil',
  ])('removes unsafe Markdown link destinations: %s', (destination) => {
    const { container } = render(<SafeMarkdown>{`[Details](${destination})`}</SafeMarkdown>);
    expect(container.querySelector('a')).toHaveAttribute('href', '');
  });

  it('renders escaped HTML as inert text', () => {
    const { container } = render(
      <SafeMarkdown>{'&lt;script&gt;alert(1)&lt;/script&gt;'}</SafeMarkdown>,
    );
    expect(container).toHaveTextContent('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });
});
