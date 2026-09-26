import { redirect } from 'next/navigation';

/* The root has no content of its own. Proxy sends signed out visitors to the
   sign in screen and signed in ones to their dashboard, so this only runs when
   neither applies. */
export default function Home() {
  redirect('/login');
}
