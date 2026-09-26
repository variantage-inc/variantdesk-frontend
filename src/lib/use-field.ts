'use client';

import { useCallback, useRef, useState } from 'react';
import type { Rule } from './validation';

/* One form field: its value, whether it is wrong, and when to say so.

   The timing is the point. Validating on every keystroke means telling someone
   their email is invalid while they are still typing the first letter, which
   is nagging rather than helping. So:

     first pass   on blur, once they have finished with the field
     after that   live, so the error clears the moment they fix it

   Server errors are pushed in through setError, which is how a per field
   message from the API lands under the right input. */
export type FieldState = {
  value: string;
  error: string | null;
  set: (value: string) => void;
  onBlur: () => void;
  setError: (message: string | null) => void;
  validate: () => boolean;
  reset: () => void;
};

export function useField(initial: string, rule: Rule): FieldState {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  /* A ref, not state: whether the field has been visited changes nothing on
     screen by itself, so re-rendering for it would be wasted work. */
  const touched = useRef(false);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      /* Only re-check once they have already left the field once. Before that,
         stay quiet and let them type. */
      if (touched.current) setError(rule(next));
    },
    [rule],
  );

  const onBlur = useCallback(() => {
    touched.current = true;
    setError(rule(value));
  }, [rule, value]);

  const validate = useCallback(() => {
    const problem = rule(value);
    touched.current = true;
    setError(problem);
    return !problem;
  }, [rule, value]);

  const reset = useCallback(() => {
    setValue(initial);
    setError(null);
    touched.current = false;
  }, [initial]);

  return { value, error, set, onBlur, setError, validate, reset };
}

/* Validates a whole form and returns whether it may be submitted. Every field
   is checked, not just up to the first failure, so all the problems appear at
   once rather than one per attempt. */
export function validateAll(fields: FieldState[]): boolean {
  return fields.map((f) => f.validate()).every(Boolean);
}

/* Puts per field errors from the API under the right inputs. */
export function applyServerErrors(
  map: Record<string, FieldState>,
  fields: Record<string, string> | undefined,
): void {
  if (!fields) return;
  for (const [name, message] of Object.entries(fields)) {
    map[name]?.setError(message);
  }
}
