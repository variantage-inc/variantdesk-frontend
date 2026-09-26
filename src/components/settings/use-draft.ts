'use client';

import { useCallback, useState } from 'react';

/* One tab's worth of unsaved edits.

   Dirty is worked out by comparing against the last saved copy rather than by
   setting a flag when a field changes. Typing a character and deleting it
   again leaves the form clean, which is what somebody who did exactly that
   expects, and it means Discard has nothing to do rather than something
   surprising.

   The comparison is a JSON round trip. These objects are a dozen flat fields,
   so it costs nothing worth measuring and it cannot miss a nested change the
   way a hand written comparison eventually does. */
export type Draft<T> = {
  value: T;
  set: <K extends keyof T>(key: K, next: T[K]) => void;
  dirty: boolean;
  reset: () => void;
  /* Called after the API accepts a save: the new values become the baseline,
     so the form goes clean without a reload. */
  commit: (next: T) => void;
};

export function useDraft<T extends object>(initial: T): Draft<T> {
  const [value, setValue] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);

  const set = useCallback(<K extends keyof T>(key: K, next: T[K]) => {
    setValue((prev) => ({ ...prev, [key]: next }));
  }, []);

  const reset = useCallback(() => setValue(saved), [saved]);

  const commit = useCallback((next: T) => {
    setValue(next);
    setSaved(next);
  }, []);

  return { value, set, dirty: JSON.stringify(value) !== JSON.stringify(saved), reset, commit };
}
