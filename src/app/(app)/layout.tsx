'use client';

import { RequireAuth } from '@/components/require-auth';

/* Every signed in screen lives under this group.

   RequireAuth decides whether to render at all, and carries the idle timer, so
   the timer runs on every signed in page and on none of the signed out ones.
   Nothing here decides what a person is allowed to do: that is settled by the
   API on every request, because anything decided in a browser can be edited in
   a browser.

   The `app` class is what turns on the sidebar layout in shell.css. It is on
   the wrapper rather than on <body>, so the auth screens in the sibling group
   are unaffected. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="app">{children}</div>
    </RequireAuth>
  );
}
