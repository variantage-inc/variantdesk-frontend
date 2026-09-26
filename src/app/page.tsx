/* Phase 0 landing page: proof that the three pieces are talking to each other.
   It is replaced by the real application shell in Phase 3. Its only job today
   is to fail loudly and specifically when something is not connected. */
import { getHealth, type Health } from '@/lib/api';

export const dynamic = 'force-dynamic';

async function load(): Promise<{ health: Health | null; error: string | null }> {
  try {
    return { health: await getHealth(), error: null };
  } catch (err) {
    return { health: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <span
        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{label}</p>
        <p className="break-words text-sm text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

export default async function Home() {
  const { health, error } = await load();
  const apiOk = !!health;
  const dbOk = !!health?.database.ok;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        Variantage Finance
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
        Phase 0: the pieces are wired up
      </h1>
      <p className="mt-2 text-slate-500">
        Next.js talks to the Express API, and the API talks to Postgres. Every phase
        after this one builds on these three lines being green.
      </p>

      <div className="mt-8 grid gap-3">
        <Row label="Frontend (Next.js)" ok detail="This page rendered, so the web app is running." />
        <Row
          label="API (Express)"
          ok={apiOk}
          detail={
            apiOk
              ? `${health!.service} responded at ${health!.time}`
              : `Could not reach the API. ${error ?? ''} Is it running on port 4000?`
          }
        />
        <Row
          label="Database (PostgreSQL)"
          ok={dbOk}
          detail={
            dbOk
              ? `Answered a query in ${health!.database.latencyMs}ms`
              : health?.database.message ?? 'The API could not reach the database.'
          }
        />
      </div>

      <p className="mt-8 text-sm text-slate-400">
        Next: Phase 1, the full database schema. See PLAN.md at the project root.
      </p>
    </main>
  );
}
