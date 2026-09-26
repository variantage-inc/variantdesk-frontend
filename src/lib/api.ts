/* The single door to the API.

   Everything the frontend knows about the backend goes through here: the base
   URL, the error shape, and credentials. When auth arrives it gains a refresh
   interceptor, and nothing else in the app has to change. */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string> };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    /* the refresh token travels as a cookie, so the request has to carry it */
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const e = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'error',
      e?.message ?? `The API returned ${res.status}.`,
      e?.fields,
    );
  }

  return body as T;
}

export type Health = {
  service: string;
  status: 'ok' | 'degraded';
  time: string;
  database: { ok: boolean; latencyMs?: number; message?: string };
};

export const getHealth = () => api<Health>('/api/health');
