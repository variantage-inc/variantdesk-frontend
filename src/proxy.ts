import { NextResponse } from 'next/server';

/* Next 16 renamed Middleware to Proxy. Same thing, new file name.

   What this does NOT do is decide whether you are signed in. Next's own docs
   are explicit that proxy is for optimistic checks, not session management,
   and it could not do it here anyway: the refresh cookie is scoped to the API
   at /api/auth, so it is never sent to these pages. Authorisation happens in
   the API on every request, and the client guard only decides what to render.

   What it does do is set the headers that are easy to forget and expensive to
   omit. */
export function proxy() {
  const res = NextResponse.next();

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  /* Voice entry records from the microphone, on this site and nowhere else.
     Nothing needs a camera or a location. */
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');

  return res;
}

export const config = {
  /* Skip static assets and images. They gain nothing from these headers and
     running on them just costs time on every request. */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand).*)'],
};
