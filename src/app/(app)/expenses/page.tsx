'use client';

import { EntriesScreen } from '@/components/entries/entries-screen';

/* Expenses and owner drawings share one screen, because there is one place
   money goes out and two things it can be. */
export default function ExpensesPage() {
  return <EntriesScreen side="MONEY_OUT" />;
}
