/* Field rules, mirroring backend/src/lib/validation.ts.

   The API is the authority and checks everything again. What this buys is that
   a typo is caught at the field the moment you leave it, instead of after you
   have filled in the rest of the form and pressed the button.

   The two repos are separate, so these rules are duplicated rather than
   imported. They must be changed together. If the pair ever drifts, the API
   wins and the customer sees a server error where they expected an inline one,
   which is the symptom to look for. */

/* Not \w or [a-z]. Customers are called Renée, O'Brien, Jean-Luc and St. John.
   What is refused is digits, because a first name is not 89. */
const NAME = /^\p{L}[\p{L}\p{M}'’.\- ]*$/u;

/* Local part, @, domain, dot, real suffix. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export type Rule = (value: string) => string | null;

export const personName =
  (label: string): Rule =>
  (value) => {
    const v = value.trim();
    if (!v) return `Enter your ${label}.`;
    if (v.length > 80) return `That ${label} is too long.`;
    if (!NAME.test(v)) return `A ${label} cannot contain numbers or symbols.`;
    return null;
  };

export const email: Rule = (value) => {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (v.length > 254) return 'That email address is too long.';
  if (!EMAIL.test(v)) {
    return 'That does not look like an email address. Check for a missing @ or a typo.';
  }
  return null;
};

export const password: Rule = (value) => {
  if (!value) return 'Enter a password.';
  if (value.length < 10) return 'Passwords must be at least 10 characters long.';
  if (value.length > 200) return 'That password is too long.';
  return null;
};

export const businessName: Rule = (value) => {
  const v = value.trim();
  if (v.length < 2) return 'Enter your business name.';
  if (v.length > 120) return 'That business name is too long.';
  /* Digits and symbols are fine here: 123 Plumbing and A&W are real names.
     What is refused is a value with no letter in it at all. */
  if (!/\p{L}/u.test(v)) return 'A business name needs at least one letter.';
  return null;
};

export const required =
  (message: string): Rule =>
  (value) =>
    value.trim() ? null : message;

export const matches =
  (other: string, message: string): Rule =>
  (value) =>
    value === other ? null : message;

/* Runs a set of rules and returns only the fields that failed. */
export function check(fields: Record<string, [string, Rule]>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, [value, rule]] of Object.entries(fields)) {
    const problem = rule(value);
    if (problem) errors[name] = problem;
  }
  return errors;
}
