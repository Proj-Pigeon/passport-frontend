import ReactMarkdown from 'react-markdown';

export function SafeMarkdown({ children }: { children: string }) {
  return <ReactMarkdown skipHtml>{children}</ReactMarkdown>;
}
