'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/* The confirmation strip from the mockups.

   Auto dismisses after four seconds, which is the window in the UX rules: long
   enough to read a short sentence, short enough not to sit over the thing you
   just changed. aria-live polite, so a screen reader hears it without losing
   the place in the form. */

type Toast = { text: string; tone: 'ok' | 'err' } | null;

const ToastContext = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);

  const show = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        id="toast"
        role="status"
        aria-live="polite"
        className={toast ? 'on' : undefined}
        style={
          toast?.tone === 'err' ? { background: 'var(--red-600)', color: '#fff' } : undefined
        }
      >
        {toast?.text ?? ''}
      </div>
    </ToastContext.Provider>
  );
}
