'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/form';
import { SaveBarProvider, useSaveBarState } from '@/components/settings/save-bar';
import { ToastProvider } from '@/components/settings/toast';
import { BusinessTab } from '@/components/settings/business-tab';
import { TaxTab } from '@/components/settings/tax-tab';
import { InvoiceTab } from '@/components/settings/invoice-tab';
import { CategoriesTab } from '@/components/settings/categories-tab';
import { VendorsTab } from '@/components/settings/vendors-tab';
import { TeamTab } from '@/components/settings/team-tab';
import { BillingTab } from '@/components/settings/billing-tab';
import { SecurityTab } from '@/components/settings/security-tab';
import { getSettings, type SettingsPayload } from '@/lib/api';
import { useSession } from '@/lib/session';
import { setHash, useHash } from '@/lib/use-hash';

/* Settings.

   Six tabs in the approved mockup, and two more here: Plan and billing, and
   Your team. Both are consequences of the commercial model the client settled
   after the mockups were drawn, and neither has anywhere else to live. They
   are flagged in the report rather than slipped in quietly.

   The whole screen loads once, at the top, and hands the same payload to every
   tab. Six tabs each fetching the same business row would be six round trips
   to draw one page. */

const TABS = [
  { key: 'business', label: 'Business profile' },
  { key: 'tax', label: 'Tax and currency' },
  { key: 'invoice', label: 'Invoice template' },
  { key: 'cats', label: 'Categories' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'team', label: 'Your team' },
  { key: 'billing', label: 'Plan and billing' },
  { key: 'security', label: 'Security' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  return (
    <ToastProvider>
      <SaveBarProvider>
        <SettingsInner />
      </SaveBarProvider>
    </ToastProvider>
  );
}

function SettingsInner() {
  const { setBusiness } = useSession();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /* The hash IS the tab, rather than something copied into state on mount.

     That makes a tab linkable, which the trial banner relies on: it points at
     /settings#billing, and somebody already on Settings gets no remount, so a
     copy held in state would stay on the wrong tab. */
  const hash = useHash();
  const tab: TabKey = TABS.some((t) => t.key === hash) ? (hash as TabKey) : 'business';

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        /* The sidebar and the idle timer read the business from the session,
           so a rename or a new timeout has to reach it too. */
        setBusiness(payload.business);
      })
      .catch(() => {
        if (!cancelled) setProblem('We could not load your settings. Refresh and try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [setBusiness]);

  const onSaved = useCallback(
    (payload: SettingsPayload) => {
      setData(payload);
      setBusiness(payload.business);
    },
    [setBusiness],
  );


  return (
    <AppShell crumb="Settings">
      <div className="phead">
        <div>
          <h1>Settings</h1>
          <p className="sub">
            Everything the rest of Variantage reads from. Set once, and every invoice, tax
            figure and category follows it.
          </p>
        </div>
        <div className="acts">
          <SaveActions />
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Notice icon="info" title="This is the screen the others point at">
          Where an invoice says it comes from your template, or an expense says your province
          sets the rate, it is reading from here. Nothing on this screen is typed twice
          anywhere else.
        </Notice>
      </div>

      <div className="statustabs" style={{ padding: '0 0 18px' }} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={tab === t.key ? 'on' : undefined}
            aria-selected={tab === t.key}
            onClick={() => setHash(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {problem && <Notice tone="err" icon="alert">{problem}</Notice>}

      {!data && !problem && <p className="hint">Loading your settings…</p>}

      {data && (
        <>
          {tab === 'business' && <BusinessTab data={data} onSaved={onSaved} />}
          {tab === 'tax' && <TaxTab data={data} onSaved={onSaved} />}
          {tab === 'invoice' && <InvoiceTab data={data} onSaved={onSaved} />}
          {tab === 'cats' && <CategoriesTab />}
          {tab === 'vendors' && <VendorsTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'security' && <SecurityTab data={data} onSaved={onSaved} />}
        </>
      )}
    </AppShell>
  );
}

/* The page head buttons, lent by whichever tab has a draft in it. Tabs that
   act immediately, like Categories, lend nothing and the buttons disappear
   rather than sitting there doing nothing. */
function SaveActions() {
  const bar = useSaveBarState();
  if (!bar) return null;

  return (
    <>
      <button
        className="btn btn-sm"
        type="button"
        onClick={bar.discard}
        disabled={!bar.dirty || bar.saving}
      >
        Discard changes
      </button>
      <button
        className="btn btn-primary"
        type="button"
        onClick={bar.save}
        disabled={!bar.dirty || bar.saving}
        aria-busy={bar.saving}
      >
        <Icon name="check" size={19} /> {bar.saving ? 'Saving…' : 'Save changes'}
      </button>
    </>
  );
}
