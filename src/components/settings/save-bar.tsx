'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* Save and Discard live in the page head, as the approved screen has them, but
   each tab talks to its own endpoint. So the active tab lends the page head
   its two buttons and takes them back when it unmounts.

   The alternative, a Save that writes all six tabs at once, would turn one
   changed field into six database writes and one failure into an unclear
   half-saved state. */

export type SaveBar = {
  dirty: boolean;
  saving: boolean;
  save: () => void;
  discard: () => void;
};

type Ctx = { bar: SaveBar | null; publish: (bar: SaveBar | null) => void };

const SaveBarContext = createContext<Ctx>({ bar: null, publish: () => undefined });

export function SaveBarProvider({ children }: { children: React.ReactNode }) {
  const [bar, setBar] = useState<SaveBar | null>(null);
  const publish = useCallback((next: SaveBar | null) => setBar(next), []);
  return <SaveBarContext.Provider value={{ bar, publish }}>{children}</SaveBarContext.Provider>;
}

export const useSaveBarState = (): SaveBar | null => useContext(SaveBarContext).bar;

/* Called by whichever tab has unsaved work.

   The two callbacks go through refs, so the effect below depends only on the
   two booleans. Without that it would re-publish on every render, because a
   fresh arrow function is a different value every time. */
export function useSaveBar(
  dirty: boolean,
  saving: boolean,
  save: () => void,
  discard: () => void,
): void {
  const { publish } = useContext(SaveBarContext);

  const saveRef = useRef(save);
  const discardRef = useRef(discard);

  useEffect(() => {
    saveRef.current = save;
    discardRef.current = discard;
  });

  useEffect(() => {
    publish({
      dirty,
      saving,
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => publish(null);
  }, [dirty, saving, publish]);
}
