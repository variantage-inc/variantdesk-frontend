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
  /* What is on file. The picture itself is a short lived link from getLogoUrl. */
  logo: { fileName: string; contentType: string; sizeBytes: number; uploadedAt: string | null } | null;
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
  /* Set when a payment on an invoice posted this. It belongs to that invoice
     and cannot be edited here: changing it would move the money without moving
     the invoice balance. */
  fromInvoice: { id: string; number: string } | null;
  /* The receipts behind it. Empty means the clip in the row is dashed. */
  attachments: Attachment[];
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
    /* How much of the income was posted by a payment on an invoice rather than
       typed in by hand. Zero on the money out screen. */
    fromInvoicesCents: number;
    fromInvoicesCount: number;
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

/* ------------------------------------------------------ clients, invoices --- */

export type Client = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  since: string;
  paymentTermsDays: number | null;
  /* Every figure here is worked out from the invoices, never stored on the
     client, so a balance cannot drift away from the invoices underneath it. */
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  draftCents: number;
  invoiceCount: number;
  draftCount: number;
  overdueCount: number;
  averageDaysToPay: number | null;
};

export type ClientList = {
  clients: Client[];
  totals: { billedCents: number; paidCents: number; outstandingCents: number };
  currency: string;
  dateFormat: DateFormat;
};

export const listClients = (search?: string) =>
  api<ClientList>(`/api/clients${search ? `?search=${encodeURIComponent(search)}` : ''}`);

export type ClientInput = {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
};

export type ClientDetail = {
  client: ClientInput & {
    id: string;
    since: string;
    archived: boolean;
    /* What the business template says, shown when this client has no override
       of their own, so the box is never just blank. */
    defaultTermsDays: number;
  };
  stats: Omit<Client, 'id' | 'name' | 'contactName' | 'email' | 'phone' | 'since' | 'paymentTermsDays'>;
  invoices: Invoice[];
  payments: (Payment & { invoiceNumber: string; invoiceId: string })[];
  currency: string;
  dateFormat: DateFormat;
};

export const getClient = (id: string) => api<ClientDetail>(`/api/clients/${id}`);
export const createClient = (input: ClientInput) => post<ClientDetail>('/api/clients', input);
export const updateClient = (id: string, input: ClientInput) =>
  put<ClientDetail>(`/api/clients/${id}`, input);
export const archiveClient = (id: string) => del<{ ok: true }>(`/api/clients/${id}`);

/* Five statuses, and every one of them is WORKED OUT from the payments and the
   due date rather than stored. A stored status is a second copy of what the
   payments already say, and the two drift the first time a due date passes at
   midnight without anybody visiting the page. */
export type InvoiceStatus = 'draft' | 'sent' | 'part' | 'paid' | 'overdue';

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type Payment = {
  id: string;
  date: string;
  amountCents: number;
  method: PaymentMethod | null;
  reference: string | null;
  by: string;
  at: string;
  transactionId: string;
};

export type Invoice = {
  id: string;
  number: string;
  client: { id: string; name: string };
  issueDate: string;
  dueDate: string;
  paymentTermsDays: number;
  /* Negative once it is late, so the list can say "12 days late" rather than
     making the reader subtract two dates. */
  daysToDue: number;
  status: InvoiceStatus;
  subtotalCents: number;
  discountMode: 'AMOUNT' | 'PERCENT';
  discountValue: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  chargeTax: boolean;
  taxLabel: string;
  notes: string | null;
  sentAt: string | null;
  seller: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    gstHstNumber: string | null;
  };
  billTo: { name: string; contact: string | null; address: string | null };
  terms: string | null;
  footer: string | null;
  payTo: string | null;
  items: InvoiceItem[];
  payments: Payment[];
  createdAt: string;
  /* Only on a single invoice: the logo it was printed with, as a five minute
     link, and the documents attached to it. */
  logoUrl?: string | null;
  attachments?: Attachment[];
};

export type InvoiceList = {
  invoices: Invoice[];
  total: number;
  page: number;
  perPage: number;
  counts: Record<'all' | InvoiceStatus, number>;
  summary: {
    owedCents: number;
    owedCount: number;
    lateCents: number;
    lateCount: number;
    oldestLateDays: number;
    draftCents: number;
    draftCount: number;
  };
  currency: string;
  dateFormat: DateFormat;
};

export const listInvoices = (
  filters: { status?: string; clientId?: string; search?: string; page?: number } = {},
) => api<InvoiceList>(`/api/invoices${qs(filters as EntryFilters)}`);

export const getInvoice = (id: string) => api<{ invoice: Invoice }>(`/api/invoices/${id}`);

export type InvoiceDefaults = {
  /* Shown, not reserved. Reserving it would burn a number every time somebody
     opened the builder and changed their mind, and the sequence has to be
     unbroken. */
  nextNumber: string;
  paymentTermsDays: number;
  terms: string | null;
  footer: string | null;
  payTo: string | null;
  gstHstNumber: string | null;
  gstRegistered: boolean;
  sellerName: string;
  sellerAddress: string | null;
  tax: { code: string; name: string; label: string; note: string; totalBp: number };
  currency: string;
  dateFormat: DateFormat;
};

export const invoiceDefaults = () => api<InvoiceDefaults>('/api/invoices/new');

export type InvoiceInput = {
  clientId: string;
  issueDate: string;
  paymentTermsDays: number;
  lines: { description: string; quantity: number; unitPrice: number }[];
  discountMode: 'AMOUNT' | 'PERCENT';
  discountValue: number;
  chargeTax: boolean;
  notes?: string | null;
};

export const createInvoice = (input: InvoiceInput) =>
  api<{ invoice: Invoice }>('/api/invoices', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: idempotent(),
  });

export const updateInvoice = (id: string, input: InvoiceInput) =>
  api<{ invoice: Invoice }>(`/api/invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    headers: idempotent(),
  });

/* Turns a draft into a debt the client owes. Posts no income: that happens
   when the money arrives, which is what stops it being counted twice. */
export const sendInvoice = (id: string) =>
  api<{ invoice: Invoice }>(`/api/invoices/${id}/send`, { method: 'POST', headers: idempotent() });

export const voidInvoice = (id: string) =>
  api<{ ok: true }>(`/api/invoices/${id}`, { method: 'DELETE', headers: idempotent() });

export type PaymentContext = {
  number: string;
  clientName: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  subtotalCents: number;
  taxCents: number;
  taxLabel: string;
  chargeTax: boolean;
};

export const paymentContext = (id: string) =>
  api<PaymentContext>(`/api/invoices/${id}/payment-context`);

/* The one place a payment is recorded, and the one place income is posted for
   an invoice. There is deliberately no second door. */
export const recordPayment = (
  id: string,
  input: { date: string; amount: number; method?: PaymentMethod | null; reference?: string | null },
) =>
  api<{ invoice: Invoice }>(`/api/invoices/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: idempotent(),
  });

export const removePayment = (id: string, paymentId: string) =>
  api<{ invoice: Invoice }>(`/api/invoices/${id}/payments/${paymentId}`, {
    method: 'DELETE',
    headers: idempotent(),
  });

/* ------------------------------------------------------------- dashboard --- */

/* Every figure here is worked out by the API from the ledger rows, in one
   place, which the Phase 9 reports will call as well. A second copy of this
   arithmetic in the browser would be a second answer waiting to disagree. */
export type Bucket3 = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  count: number;
};

export type MonthPoint = {
  key: string;
  label: string;
  year: number;
  from: string;
  to: string;
  incomeCents: number;
  expensesCents: number;
  drawingsCents: number;
};

export type Dashboard = {
  period: {
    from: string;
    to: string;
    /* False while the period still includes today. Nothing is compared against
       a period that has not finished. */
    complete: boolean;
    totalDays: number;
    elapsedDays: number;
  };
  income: Bucket3;
  expenses: Bucket3;
  drawings: Bucket3;
  netProfitCents: number;
  taxOwedCents: number;
  leftInBusinessCents: number;
  byCategory: { id: string | null; name: string; cents: number; count: number; shareBp: number }[];
  months: MonthPoint[];
  /* A position today, not a total over the period, which is why it does not
     move with the period control. */
  invoices: {
    owedCents: number;
    owedCount: number;
    overdueCents: number;
    overdueCount: number;
    oldest: {
      id: string;
      number: string;
      clientName: string;
      totalCents: number;
      balanceCents: number;
      dueDate: string;
      daysToDue: number;
      status: InvoiceStatus;
    }[];
  };
  recent: {
    id: string;
    date: string;
    type: TxType;
    description: string;
    party: string | null;
    category: string | null;
    totalCents: number;
    fromInvoice: { id: string; number: string } | null;
  }[];
  /* Expenses in the period with nothing attached, and the tax on them. */
  missingReceipts: MissingSummary;
  /* Only present when the period has finished. */
  previous: {
    from: string;
    to: string;
    income: Bucket3;
    expenses: Bucket3;
    drawings: Bucket3;
    netProfitCents: number;
    taxOwedCents: number;
    leftInBusinessCents: number;
  } | null;
  tax: { code: string; name: string; label: string; note: string; totalBp: number };
  gstRegistered: boolean;
  currency: string;
  dateFormat: DateFormat;
};

export const getDashboard = (from: string, to: string) =>
  api<Dashboard>(`/api/dashboard?from=${from}&to=${to}`);

/* -------------------------------------------------------------- receipts --- */

/* A receipt is never a loose file: it belongs to one entry or one invoice.
   The storage key never reaches the browser. A file is looked at through a
   five minute signed link, and saved through the API. */

export type Attachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type ReceiptOn = {
  kind: TxType | 'INVOICE';
  id: string;
  date: string;
  title: string;
  party: string | null;
  category: string | null;
  totalCents: number;
  taxCents: number;
  fromInvoice: { id: string; number: string } | null;
};

export type Receipt = Attachment & { by: string; on: ReceiptOn };

export type MissingSummary = {
  count: number;
  atRiskCents: number;
  firstDate: string | null;
  lastDate: string | null;
};

export type MissingEntry = {
  id: string;
  date: string;
  description: string;
  vendor: string | null;
  category: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type ReceiptFilters = {
  on?: 'all' | 'EXPENSE' | 'INCOME' | 'DRAWING' | 'INVOICE';
  fileType?: 'all' | 'pdf' | 'img';
  search?: string;
  from?: string;
  to?: string;
  page?: number;
};

export type ReceiptList = {
  receipts: Receipt[];
  total: number;
  page: number;
  perPage: number;
  counts: Record<'all' | TxType | 'INVOICE', number>;
  summary: { files: number; pdfs: number; images: number; bytes: number };
  missing: MissingSummary & { subtotalCents: number; entries: MissingEntry[] };
  configured: boolean;
  maxBytes: number;
  currency: string;
  dateFormat: DateFormat;
  gstRegistered: boolean;
};

export const listReceipts = (filters: ReceiptFilters = {}) =>
  api<ReceiptList>(`/api/receipts${qs(filters as EntryFilters)}`);

/* A file goes up as its own bytes, not a form, with its name in a header. The
   API reads the bytes to decide what it is, so the type sent here is only a
   label for the transport. */
async function sendFile<T>(path: string, file: File, method: 'POST' | 'PUT'): Promise<T> {
  const send = () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: file,
    });

  let res = await send();
  if (res.status === 401 && (await refresh().catch(() => null))) res = await send();

  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as (T & Body) | null;
  if (!res.ok || !body) {
    const e = body?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'upload_failed',
      e?.message ?? 'That file did not upload. Try again.',
    );
  }
  return body;
}

export const attachToEntry = (entryId: string, file: File) =>
  sendFile<{ receipt: Attachment }>(`/api/entries/${entryId}/attachments`, file, 'POST');

export const attachToInvoice = (invoiceId: string, file: File) =>
  sendFile<{ receipt: Attachment }>(`/api/invoices/${invoiceId}/attachments`, file, 'POST');

export const viewAttachment = (id: string) =>
  api<{ url: string; expiresInSeconds: number; contentType: string }>(
    `/api/attachments/${id}/view`,
  );

export const deleteAttachment = (id: string) => del<{ ok: true }>(`/api/attachments/${id}`);

/* Saved through the API with the access token, like a report export. A link
   to the storage origin cannot be told to save rather than show. */
export async function downloadAttachment(id: string): Promise<string> {
  return fetchAndSave(`/api/attachments/${id}/download`, 'receipt');
}

export const uploadLogo = (file: File) =>
  sendFile<SettingsPayload>('/api/settings/logo', file, 'PUT');
export const removeLogo = () => del<SettingsPayload>('/api/settings/logo');
export const getLogoUrl = () => api<{ url: string | null }>('/api/settings/logo');

/* --------------------------------------------------------------- reports --- */

/* The seven reports are built by the API as DOCUMENTS: a heading, some cards,
   some notices, some tables. This screen draws that document, and the PDF and
   the spreadsheet draw the same one on the server, so the file somebody sends
   their accountant cannot say something different from the screen they sent it
   from.

   Nothing here works a figure out. Every number arrives ready, in cents, from
   modules/reporting/derive.ts, which is also what the dashboard reads. */

export type ReportId =
  | 'income'
  | 'expenses'
  | 'profit'
  | 'tax'
  | 'invoices'
  | 'drawings'
  | 'cashflow';

export type ReportTone = 'in' | 'out' | 'draw' | 'muted';

export type ReportCell = {
  cents?: number;
  percent?: number;
  text?: string;
  sub?: string;
  subTone?: 'late';
  strong?: boolean;
  tone?: ReportTone;
  align?: 'right';
  bars?: { share: number; tone: ReportTone }[];
  pill?: { label: string; cls: string };
};

export type ReportTable = {
  title: string;
  columns: { label: string; align?: 'right'; width?: string }[];
  rows: { cells: ReportCell[]; tone?: 'draw' }[];
  foot?: ReportCell[];
};

export type ReportKpi = {
  label: string;
  cents?: number;
  text?: string;
  note?: string;
  tone?: 'in' | 'out' | 'draw';
  /* Absent for a period that has not finished. The API withholds it rather
     than sending a number this screen has to remember not to draw. */
  delta?: { percent: number; label: string };
};

export type ReportNote = {
  tone: 'info' | 'warn' | 'ok' | 'draw';
  icon: string;
  title: string;
  body: string;
};

export type ReportDoc = {
  id: ReportId;
  name: string;
  blurb: string;
  period: {
    from: string;
    to: string;
    label: string;
    rangeLabel: string;
    complete: boolean;
    totalDays: number;
    elapsedDays: number;
    /* False on the invoice report, which is a position today rather than a
       total for a range. */
    scoped: boolean;
  };
  basis: string | null;
  seller: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    gstHstNumber: string | null;
    gstRegistered: boolean;
  };
  preparedOn: string;
  currency: string;
  dateFormat: DateFormat;
  taxLabel: string;
  kpis: ReportKpi[];
  notes: ReportNote[];
  tables: ReportTable[];
  footnote: string;
};

export type ReportChoice = { id: ReportId; icon: string; name: string; blurb: string };

export const getReports = () => api<{ reports: ReportChoice[] }>('/api/reports');

export const getReport = (id: ReportId, from: string, to: string, compare: boolean) =>
  api<{ report: ReportDoc }>(
    `/api/reports/${id}?from=${from}&to=${to}&compare=${compare ? 1 : 0}`,
  );

/* The export.

   Fetched with the access token like every other call, rather than linked to.
   A plain link carries no Authorization header, so making one work would mean
   putting a token in the URL, and a URL is the one place a credential must
   never be: it lands in browser history, in server logs and in whatever the
   customer pastes into an email. The file arrives as a blob and is handed to
   the browser from memory. */
export async function downloadReport(
  id: ReportId,
  format: 'pdf' | 'xlsx',
  from: string,
  to: string,
  compare: boolean,
): Promise<string> {
  return fetchAndSave(
    `/api/reports/${id}/${format}?from=${from}&to=${to}&compare=${compare ? 1 : 0}`,
    `report.${format}`,
  );
}

/* Fetch a file with the access token and hand it to the browser to save. */
async function fetchAndSave(path: string, fallbackName: string): Promise<string> {
  const fetchIt = () =>
    fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

  let res = await fetchIt();
  /* One retry after a refresh, the same rule the JSON calls follow. */
  if (res.status === 401 && (await refresh().catch(() => null))) res = await fetchIt();

  if (!res.ok) {
    throw new ApiError(res.status, 'download_failed', 'We could not fetch that file. Try again.');
  }

  /* The UTF-8 form first, so a name with an accent survives. */
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = utf8
    ? decodeURIComponent(utf8)
    : (/filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName);

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoked on a timer rather than immediately: Safari has not finished
     reading the blob when click() returns. */
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return name;
}

/* ----------------------------------------------------------------- voice --- */

/* Dictating an entry.

   Two calls, and the gap between them is the whole feature. `captureVoice`
   sends a clip and gets back a DRAFT, which is a proposal and is money
   nowhere. `confirmVoice` is the only one that writes, and it sends whatever
   is on screen, including anything the owner corrected, to be validated and
   posted exactly as a typed entry is.

   Nothing here is ever saved from speech alone. */

export type VoiceStatus = 'DRAFT' | 'CONFIRMED' | 'DISCARDED' | 'FAILED';

export type VoiceGuess = { field: string; reason: string };

export type VoiceDraft = {
  id: string;
  status: VoiceStatus;
  /* What was said, as it was heard. Shown next to the fields, because "it put
     in the wrong amount" is answerable only if the sentence is still there. */
  transcript: string;
  /* Null on a FAILED draft, which is the honest answer when the sentence was
     not about a transaction. */
  type: 'INCOME' | 'EXPENSE' | 'DRAWING' | null;
  amountCents: number | null;
  taxMode: 'ADD' | 'INCLUSIVE' | 'NONE' | null;
  date: string | null;
  description: string | null;
  purpose: string | null;
  /* The name as spoken, and the row it was matched to if one matched. Nothing
     is created from speech, so an unmatched name has no id and the screen asks. */
  party: string | null;
  category: { id: string; name: string; kind: string } | null;
  vendor: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  guesses: VoiceGuess[];
  model: string;
  transactionId: string | null;
  createdAt: string;
};

export type VoiceOptions = {
  categories: { id: string; name: string; kind: 'INCOME' | 'EXPENSE' | 'DRAWINGS' }[];
  vendors: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  tax: { code: string; name: string; label: string; note: string; totalBp: number };
  currency: string;
  dateFormat: DateFormat;
  today: string;
  /* False when no Gemini key is configured, so the screen can say so before
     anybody speaks rather than failing after. */
  configured: boolean;
  maxSeconds: number;
};

export type VoiceConfirmInput = {
  type: 'INCOME' | 'EXPENSE' | 'DRAWING';
  date: string;
  amount: number;
  description: string;
  categoryId: string | null;
  clientId?: string | null;
  vendorId?: string | null;
  taxMode: 'ADD' | 'INCLUSIVE' | 'NONE';
  purpose?: string;
};

export const getVoiceOptions = () => api<VoiceOptions>('/api/voice/options');

/* The clip goes up as a raw body with its own content type, not as a form.
   One file, one type, and no multipart parser on either side. */
export async function captureVoice(clip: Blob): Promise<VoiceDraft> {
  const send = () =>
    fetch(`${BASE_URL}/api/voice`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'audio/wav',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: clip,
    });

  let res = await send();
  if (res.status === 401 && (await refresh().catch(() => null))) res = await send();

  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as
    | { draft?: VoiceDraft; error?: { code: string; message: string } }
    | null;

  if (!res.ok || !body?.draft) {
    const e = body?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'voice_failed',
      e?.message ?? 'We could not read that clip. Try again, or type the entry in.',
    );
  }
  return body.draft;
}

/* The one write, and it carries an idempotency key like every other one: a
   double pressed Save cannot post the same entry twice. */
export const confirmVoice = (id: string, input: VoiceConfirmInput) =>
  api<{ draft: VoiceDraft; entryId: string }>(`/api/voice/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input),
    headers: idempotent(),
  });

export const discardVoice = (id: string) =>
  post<{ draft: VoiceDraft }>(`/api/voice/${id}/discard`);
