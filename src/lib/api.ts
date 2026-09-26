/* The single door to the API.

   The access token is held in a module variable, deliberately. Putting it in
   localStorage would make it readable by any script on the page, which turns a
   cross site scripting bug into a stolen session. Held here it dies with the
   tab, and the httpOnly refresh cookie quietly gets a new one. */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const getAccessToken = (): string | null => accessToken;

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: FieldErrors,
  ) {
    super(message);
  }
}

type Body = { error?: { code: string; message: string; fields?: FieldErrors } };

async function request<T>(path: string, init: RequestInit, retry: boolean): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    /* The refresh token travels as a cookie, so every call has to carry it. */
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as Body | null;

  /* An expired access token is normal, not an error. Refresh once and repeat
     the call, so the user never sees it happen. Only once: if the refresh also
     fails, the session is genuinely over and looping would just hide that. */
  if (res.status === 401 && retry && path !== '/api/auth/refresh') {
    const renewed = await refresh().catch(() => null);
    if (renewed) return request<T>(path, init, false);
  }

  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'error',
      e?.message ?? `Something went wrong (${res.status}).`,
      e?.fields,
    );
  }

  return body as T;
}

export const api = <T>(path: string, init: RequestInit = {}): Promise<T> =>
  request<T>(path, init, true);

export const post = <T>(path: string, data?: unknown): Promise<T> =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });

/* ------------------------------------------------------------------ auth --- */

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'MEMBER';
  platformRole: 'SUPERADMIN' | 'CUSTOMER';
  avatarUrl: string | null;
};

export type Business = {
  id: string;
  name: string;
  province?: string;
  currency?: string;
  /* Drive the idle logout. Sent with every session, not just with /me, so the
     browser can start counting the moment someone signs in. */
  idleTimeoutMinutes?: number;
  idleWarningSeconds?: number;
};
export type Session = { accessToken: string; user: User; business: Business };

/* Refreshing is deduplicated across the whole app.

   The refresh token is rotated on use, so sending the same one twice looks
   like a stolen token to the API. Two callers refreshing at once, which is
   easy to cause with a provider and a page both restoring on mount, would
   present the old token the second time and get the session killed.

   So every caller shares one in flight request. The second one waits for the
   first rather than starting its own. */
let inFlight: Promise<Session | null> | null = null;

async function doRefresh(): Promise<Session | null> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    setAccessToken(null);
    return null;
  }
  const session = (await res.json()) as Session;
  setAccessToken(session.accessToken);
  return session;
}

function refresh(): Promise<Session | null> {
  inFlight ??= doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export const restoreSession = refresh;

export async function signIn(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<Session> {
  const session = await post<Session>('/api/auth/login', { email, password, rememberMe });
  setAccessToken(session.accessToken);
  return session;
}

export async function signUp(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  businessName: string;
  province: string;
}): Promise<Session> {
  const session = await post<Session>('/api/auth/signup', input);
  setAccessToken(session.accessToken);
  return session;
}

export async function completeGoogleSignup(input: {
  token: string;
  businessName: string;
  province: string;
}): Promise<Session> {
  const session = await post<Session>('/api/auth/google/complete', input);
  setAccessToken(session.accessToken);
  return session;
}

export async function signOut(): Promise<void> {
  await post('/api/auth/logout').catch(() => undefined);
  setAccessToken(null);
}

export const forgotPassword = (email: string) =>
  post<{ ok: true; message: string }>('/api/auth/forgot-password', { email });

export const resetPassword = (token: string, password: string) =>
  post<{ ok: true; message: string }>('/api/auth/reset-password', { token, password });

export const googleSignInUrl = (): string => `${BASE_URL}/api/auth/google`;
