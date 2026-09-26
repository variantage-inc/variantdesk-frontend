'use client';

import { useSyncExternalStore } from 'react';

/* The URL fragment, as React state.

   Two things make this worth a hook rather than a useState set from an effect.

   It survives arriving from elsewhere. The trial banner links to
   /settings#billing, and when the reader is already on Settings only the hash
   changes: no remount, no effect, so a component holding the tab in its own
   state would sit on the wrong tab.

   And it renders correctly on the server, which has no location at all. The
   server snapshot is an empty string, so the page prerenders on its first tab
   and moves once the browser takes over. */

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

const read = () => window.location.hash.slice(1);

/* The server has no URL fragment. It is never sent to the server at all. */
const readOnServer = () => '';

export const useHash = (): string => useSyncExternalStore(subscribe, read, readOnServer);

/* replaceState rather than assigning location.hash, so switching tabs does not
   fill the back button with six entries to walk through before leaving the
   page. replaceState fires no event of its own, so one is raised here. */
export function setHash(next: string): void {
  window.history.replaceState(null, '', `#${next}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
