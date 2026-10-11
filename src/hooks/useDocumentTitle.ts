import { useEffect } from 'react';

export const APP_NAME = 'Pigeon Passport';

export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title && title.length > 0 ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
