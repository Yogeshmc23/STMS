import { useEffect } from 'react';
import { APP_NAME } from '@stms/shared';

/** Keeps the browser tab title in sync with the active page. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${APP_NAME} — ${title}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
