/* The single door to the API.

   The access token is held in a module variable, deliberately. Putting it in
   localStorage would make it readable by any script on the page, which turns a
   cross site scripting bug into a stolen session. Held here it dies with the
   tab, and the httpOnly refresh cookie quietly gets a new one. */

import type { DateFormat } from './format';

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

const withBody =
  (method: string) =>
  <T>(path: string, data?: unknown): Promise<T> =>
    api<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const post = withBody('POST');
export const put = withBody('PUT');
export const patch = withBody('PATCH');
export const del = <T>(path: string): Promise<T> => api<T>(path, { method: 'DELETE' });

/* ------------------------------------------------------------------ auth --- */

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'MEMBER';
  platformRole: 'SUPERADMIN' | 'CUSTOMER';
  avatarUrl: string | null;
  /* Which ways in this account has. Never a credential, just whether each one
     exists, so Settings can offer "set a password" to somebody who arrived
     through Google and has never had one. */
  hasPassword: boolean;
  hasGoogle: boolean;
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

export type PlanId = 'ESSENTIAL' | 'SOLUTIONS_360';
export type AccessState = 'trial' | 'active' | 'expired' | 'past_due' | 'cancelled' | 'none';

/* Whether this business may write to its books, and why.

   `canWrite` is the whole entitlement system. Both plans unlock the same
   software, so nothing in this app is ever gated on which plan somebody is on,
   and adding such a check would mean the plans had stopped being what the
   client agreed. */
export type Access = {
  state: AccessState;
  canWrite: boolean;
  plan: PlanId;
  planName: string;
  status: string;
  extraSeats: number;
  maxExtraSeats: number;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  monthlyCents: number;
  hasCard: boolean;
};

export type Session = {
  accessToken: string;
  user: User;
  business: Business;
  access: Access;
};

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

/* --------------------------------------------------------------- billing --- */

export type PlanOption = {
  id: PlanId;
  name: string;
  monthlyCents: number;
  humanSupport: boolean;
};

export type BillingStatus = {
  access: Access;
  /* Whether Stripe has keys yet. Without it the interface would offer a card
     button that always fails. */
  billingConfigured: boolean;
  catalogue: {
    trialDays: number;
    maxExtraSeats: number;
    extraSeatCents: number;
    plans: PlanOption[];
  };
};

export const billingStatus = () => api<BillingStatus>('/api/billing/status');

export const choosePlan = (plan: PlanId, extraSeats: number) =>
  put<{ access: Access }>('/api/billing/plan', { plan, extraSeats });

export const startCheckout = (returnPath: string) =>
  post<{ url: string }>('/api/billing/checkout', { returnPath });

export const openBillingPortal = (returnPath: string) =>
  post<{ url: string }>('/api/billing/portal', { returnPath });

export type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: 'PAID' | 'FAILED' | 'REFUNDED';
  description: string | null;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

export const listPayments = () => api<{ payments: PaymentRow[] }>('/api/billing/payments');

/* Development only, and the route does not exist in any other environment.
   Waiting fourteen real days to see what day 15 looks like is not a test plan. */
export const simulateBilling = (state: 'trial' | 'expired' | 'active' | 'past_due' | 'cancelled') =>
  post<{ access: Access }>('/api/billing/simulate', { state });

/* ------------------------------------------------------------------ team --- */

export type TeamMember = User & {
  lastLoginAt: string | null;
  signInMethod: 'google' | 'password' | 'pending';
};

export type TeamInvite = {
  id: string;
  email: string;
  expiresAt: string;
  expired: boolean;
  createdAt: string;
};

export type Team = {
  members: TeamMember[];
  invites: TeamInvite[];
  seatsPaid: number;
  seatsUsed: number;
  maxExtraSeats: number;
};

export const getTeam = () => api<Team>('/api/team');
export const inviteMember = (email: string) =>
  post<{ ok: true; team: Team }>('/api/team/invites', { email });
export const revokeInvite = (id: string) => del<{ team: Team }>(`/api/team/invites/${id}`);
export const removeMember = (id: string) => del<{ team: Team }>(`/api/team/members/${id}`);

export const previewInvite = (token: string) =>
  api<{ email: string; businessName: string }>(`/api/team/invites/${encodeURIComponent(token)}`);

export async function acceptInvite(
  token: string,
  input: { firstName: string; lastName: string; password: string },
): Promise<Session> {
  const session = await post<Session>(
    `/api/team/invites/${encodeURIComponent(token)}/accept`,
    input,
  );
  setAccessToken(session.accessToken);
  return session;
}

/* -------------------------------------------------------------- settings --- */

export type BusinessSettings = {
  id: string;
  name: string;
  legalName: string | null;
  businessType: 'SOLE_PROPRIETOR' | 'PARTNERSHIP' | 'CORPORATION' | 'CONTRACTOR';
  businessNumber: string | null;
  gstHstNumber: string | null;
  gstRegistered: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  currency: 'CAD' | 'USD' | 'PKR';
  dateFormat: 'YYYY/MM/DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  fyStartMonth: number;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  invoiceNumberPad: number;
  paymentTermsDays: number;
  lateInterestBp: number | null;
  invoiceTerms: string | null;
  invoiceFooter: string | null;
  invoicePayTo: string | null;
  idleTimeoutMinutes: number;
  idleWarningSeconds: number;
};

export type ProvinceRate = { code: string; name: string; label: string; note: string };

export type SettingsPayload = {
  business: BusinessSettings;
  /* The rate that follows from the province, worked out by the API. The
     browser never decides a tax rate. */
  tax: ProvinceRate & { totalBp: number; provincialRecoverable: boolean };
  provinces: ProvinceRate[];
};

export const getSettings = () => api<SettingsPayload>('/api/settings');
export const saveBusiness = (data: unknown) => put<SettingsPayload>('/api/settings/business', data);
export const saveTax = (data: unknown) => put<SettingsPayload>('/api/settings/tax', data);
export const saveInvoiceTemplate = (data: unknown) =>
  put<SettingsPayload>('/api/settings/invoice', data);
export const saveSecurity = (data: { idleTimeoutMinutes: number; idleWarningSeconds: number }) =>
  put<SettingsPayload>('/api/settings/security', data);

export const changePassword = (data: { currentPassword?: string; password: string }) =>
  post<{ ok: true; message: string }>('/api/settings/password', data);

export type ActiveSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
  remembered: boolean;
  current: boolean;
};

export const listSessions = () => api<{ sessions: ActiveSession[] }>('/api/settings/sessions');
export const revokeSession = (id: string) =>
  del<{ sessions: ActiveSession[] }>(`/api/settings/sessions/${id}`);
export const revokeOtherSessions = () =>
  del<{ count: number; sessions: ActiveSession[] }>('/api/settings/sessions');

export type Category = {
  id: string;
  name: string;
  kind: 'INCOME' | 'EXPENSE' | 'DRAWINGS';
  isSystem: boolean;
  archived: boolean;
  vendorCount: number;
};

export const listCategories = () => api<{ categories: Category[] }>('/api/settings/categories');
export const addCategory = (name: string, kind: Category['kind']) =>
  post<{ categories: Category[] }>('/api/settings/categories', { name, kind });
export const updateCategory = (id: string, data: { name?: string; archived?: boolean }) =>
  patch<{ categories: Category[] }>(`/api/settings/categories/${id}`, data);
export const archiveCategory = (id: string) =>
  del<{ categories: Category[] }>(`/api/settings/categories/${id}`);

export type Vendor = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  archived: boolean;
};

export const listVendors = () => api<{ vendors: Vendor[] }>('/api/settings/vendors');
export const addVendor = (name: string, categoryId: string | null) =>
  post<{ vendors: Vendor[] }>('/api/settings/vendors', { name, categoryId });
export const updateVendor = (
  id: string,
  data: { name?: string; categoryId?: string | null; archived?: boolean },
) => patch<{ vendors: Vendor[] }>(`/api/settings/vendors/${id}`, data);
export const archiveVendor = (id: string) => del<{ vendors: Vendor[] }>(`/api/settings/vendors/${id}`);

/* ----------------------------------------------------------------- admin --- */

export type AdminMetrics = {
  businesses: number;
  users: number;
  trialing: number;
  paying: number;
  pastDue: number;
  cancelled: number;
  monthlyCents: number;
  seatsPaid: number;
  collectedThisMonthCents: number;
  failedThisMonth: number;
  byPlan: { id: string; name: string; count: number }[];
};

export type AdminBusiness = {
  id: string;
  name: string;
  province: string;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  plan: PlanId;
  planName: string;
  state: AccessState;
  status: string;
  seatsUsed: number;
  seatsPaid: number;
  trialEndsAt: string | null;
  monthlyCents: number;
};

export type AdminBusinessDetail = {
  business: {
    id: string;
    name: string;
    legalName: string | null;
    province: string;
    currency: string;
    gstRegistered: boolean;
    createdAt: string;
  };
  access: Access;
  members: {
    id: string;
    name: string;
    email: string;
    role: 'OWNER' | 'MEMBER';
    signInMethod: string;
    lastLoginAt: string | null;
    createdAt: string;
  }[];
  pendingInvites: { email: string; expiresAt: string }[];
  payments: PaymentRow[];
};

export type AdminPayment = PaymentRow & { businessId: string; businessName: string };

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  businessId: string | null;
  detail: string | null;
  createdAt: string;
};

export const adminMetrics = () => api<AdminMetrics>('/api/admin/metrics');
export const adminBusinesses = (q?: string) =>
  api<{ businesses: AdminBusiness[] }>(
    `/api/admin/businesses${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  );
export const adminBusiness = (id: string) => api<AdminBusinessDetail>(`/api/admin/businesses/${id}`);
export const adminPayments = () => api<{ payments: AdminPayment[] }>('/api/admin/payments');
export const adminAudit = () => api<{ entries: AuditEntry[] }>('/api/admin/audit');

/* ---------------------------------------------------------- money in/out --- */

export type TxType = 'INCOME' | 'EXPENSE' | 'DRAWING';
export type TaxMode = 'ADD' | 'INCLUSIVE' | 'NONE';
export type PaymentMethod =
  | 'BANK_TRANSFER'
  | 'E_TRANSFER'
  | 'CHEQUE'
  | 'CASH'
  | 'CARD'
  | 'PRE_AUTHORISED'
  | 'OTHER';

export type Named = { id: string; name: string } | null;

export type Entry = {
  id: string;
  type: TxType;
  date: string;
  description: string;
  category: Named;
  vendor: Named;
  client: Named;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxMode: TaxMode;
  taxRateBp: number;
  taxLabel: string;
  paymentMethod: PaymentMethod | null;
  reference: string | null;
  purpose: string | null;
  /* Corrected at least once since it was written. */
  amended: boolean;
  /* Cancelled by a later correction or removal, so no longer in the books. */
  superseded: boolean;
  createdAt: string;
};

export type Bucket = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  count: number;
};

export type EntryList = {
  entries: Entry[];
  page: number;
  perPage: number;
  total: number;
  summary: {
    income: Bucket | null;
    /* Expenses and drawings are summed apart even when both are on screen.
       Adding one into the other is the error the type flag exists to stop. */
    expense: Bucket | null;
    drawing: Bucket | null;
    entries: number;
  };
  tax: { code: string; name: string; label: string; note: string; totalBp: number };
  currency: string;
  dateFormat: DateFormat;
};

export type EntryFilters = {
  from?: string;
  to?: string;
  search?: string;
  categoryId?: string;
  vendorId?: string;
  clientId?: string;
  paymentMethod?: string;
  show?: 'all' | 'expenses' | 'drawings';
  page?: number;
};

const qs = (filters: EntryFilters): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== null) params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
};

export const listIncome = (filters: EntryFilters = {}) =>
  api<EntryList>(`/api/income${qs(filters)}`);

export const listMoneyOut = (filters: EntryFilters = {}) =>
  api<EntryList>(`/api/expenses${qs(filters)}`);

export type EntryInput = {
  date: string;
  amount: number;
  description: string;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod | null;
  reference?: string | null;
  taxMode?: TaxMode;
  clientId?: string | null;
  vendorId?: string | null;
  purpose?: string;
};

/* Every write carries an idempotency key.

   The API stores the key with its answer, so a double clicked Save, or a
   retry after a timeout, gets the first answer back instead of posting the
   money a second time. Generated per attempt rather than per keystroke:
   pressing Save twice on purpose, having changed something, is a different
   request and should be. */
const idempotent = (): HeadersInit => ({ 'X-Idempotency-Key': crypto.randomUUID() });

const path: Record<TxType, string> = {
  INCOME: '/api/income',
  EXPENSE: '/api/expenses',
  DRAWING: '/api/drawings',
};

export const createEntry = (type: TxType, input: EntryInput) =>
  api<{ entry: Entry }>(path[type], {
    method: 'POST',
    body: JSON.stringify(input),
    headers: idempotent(),
  });

export const updateEntry = (type: TxType, id: string, input: EntryInput) =>
  api<{ entry: Entry }>(`${path[type]}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    headers: idempotent(),
  });

/* Writes a reversal. Nothing leaves the ledger, ever. */
export const deleteEntry = (id: string) =>
  api<{ ok: true }>(`/api/entries/${id}`, { method: 'DELETE', headers: idempotent() });

/* What changed, when, and who changed it.

   The payoff for the append only ledger. A figure that has moved is the most
   common thing anybody asks about a set of books, and the answer is almost
   never that the software is wrong: somebody corrected an entry weeks ago. */
export type Change = { field: string; from: string; to: string };

export type Version = {
  id: string;
  at: string;
  by: string;
  date: string;
  description: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxLabel: string;
  category: string | null;
  party: string | null;
  reference: string | null;
  purpose: string | null;
  /* Only the fields that moved. Empty on the first version. */
  changed: Change[];
  current: boolean;
};

export type EntryHistory = {
  versions: Version[];
  /* Set when the entry was removed rather than corrected. */
  removed: { at: string; by: string } | null;
  /* Where the live version is now, if this id has been superseded. */
  supersededBy: string | null;
  currency: string;
};

export const entryHistory = (id: string) => api<EntryHistory>(`/api/entries/${id}/history`);

export type ActivityRow = {
  id: string;
  action: 'corrected' | 'removed';
  at: string;
  by: string;
  type: TxType;
  date: string;
  description: string;
  /* Null for a removal: there is nothing left to open. */
  entryId: string | null;
  fromCents: number;
  toCents: number | null;
  changed: Change[];
};

export type Activity = {
  entries: ActivityRow[];
  total: number;
  page: number;
  perPage: number;
  currency: string;
};

export const listActivity = (filters: { from?: string; to?: string; page?: number } = {}) =>
  api<Activity>(`/api/activity${qs(filters as EntryFilters)}`);

export type Client = { id: string; name: string; email: string | null; phone: string | null };

export const listClients = () => api<{ clients: Client[] }>('/api/clients');
export const addClient = (name: string) =>
  post<{ client: Client; clients: Client[] }>('/api/clients', { name });
