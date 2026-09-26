'use client';

import { useEffect, useMemo, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  addVendor,
  archiveVendor,
  ApiError,
  listCategories,
  listVendors,
  updateVendor,
  type Category,
  type Vendor,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { useToast } from './toast';

/* Who money goes out to, grouped under an expense category.

   The grouping is what makes the Expenses screen quick: choose Bills Payment
   and only the utility companies appear, rather than a list of forty names.
   That is why the category is offered on the add row rather than left to be
   set afterwards. */

export function VendorsTab() {
  const { access } = useSession();
  const toast = useToast();

  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);

  const canEdit = access?.canWrite === true;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listVendors(), listCategories()])
      .then(([v, c]) => {
        if (cancelled) return;
        setVendors(v.vendors);
        setCategories(c.categories.filter((x) => x.kind === 'EXPENSE' && !x.archived));
      })
      .catch(() => !cancelled && toast('We could not load your vendors.', 'err'));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function run(work: () => Promise<{ vendors: Vendor[] }>, done: string) {
    setBusy(true);
    try {
      const r = await work();
      setVendors(r.vendors);
      toast(done);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work. Try again.', 'err');
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors ?? [])
      .filter((v) => !v.archived)
      .filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [vendors, search]);

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Vendors</h2>
              <p className="csub">
                {vendors === null
                  ? 'Loading…'
                  : vendors.filter((v) => !v.archived).length === 0
                    ? 'Nobody yet. Add the companies you pay, or let them build up as you record expenses.'
                    : `${vendors.filter((v) => !v.archived).length} saved, grouped by expense category.`}
              </p>
            </div>
            <div className="acts">
              <div className="tf">
                <label htmlFor="vsearch">Search</label>
                <input
                  className="input"
                  id="vsearch"
                  type="search"
                  placeholder="Vendor name"
                  value={search}
                  style={{ height: 44, minWidth: 220 }}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ margin: '16px 22px 4px' }}>
            <Notice icon="info" title="Vendors are grouped under an expense category">
              That is what makes the Expenses screen quick: choose Bills Payment and only your
              utility companies appear, rather than a list of forty names.
            </Notice>
          </div>

          {canEdit && (
            <div style={{ padding: '4px 22px 0' }}>
              <div className="addrow">
                <input
                  className="input"
                  placeholder="Add a vendor…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <select
                  className="select"
                  value={categoryId}
                  style={{ height: 48, maxWidth: 260 }}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  type="button"
                  disabled={!name.trim() || busy}
                  onClick={() => {
                    void run(
                      () => addVendor(name.trim(), categoryId || null),
                      `${name.trim()} added.`,
                    );
                    setName('');
                  }}
                >
                  <Icon name="plus" size={18} /> Add
                </button>
              </div>
            </div>
          )}

          <div className="tblwrap" style={{ marginTop: 14 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id}>
                    <td className="ttl">{v.name}</td>
                    <td>
                      {canEdit ? (
                        <select
                          className="select"
                          value={v.categoryId ?? ''}
                          style={{ height: 42, maxWidth: 240 }}
                          onChange={(e) =>
                            void run(
                              () => updateVendor(v.id, { categoryId: e.target.value || null }),
                              `${v.name} moved.`,
                            )
                          }
                        >
                          <option value="">No category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="muted">{v.categoryName ?? 'No category'}</span>
                      )}
                    </td>
                    <td>
                      {canEdit && (
                        <span className="rowacts">
                          <button
                            type="button"
                            className="del"
                            aria-label={`Archive ${v.name}`}
                            disabled={busy}
                            onClick={() =>
                              void run(() => archiveVendor(v.id), `${v.name} archived.`)
                            }
                          >
                            <Icon name="trash" size={17} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {vendors !== null && shown.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted" style={{ padding: '26px 16px' }}>
                      {search
                        ? `Nothing matching "${search}".`
                        : 'No vendors yet. They also appear here as you add them while recording an expense.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span>
              Vendors are the expense side. The people who pay <b>you</b> are clients, and they
              arrive with invoicing.
            </span>
          </div>
        </div>

        <div className="rail">
          {!canEdit && (
            <Notice tone="warn" icon="lock" title="Read only">
              Your trial has ended, so vendors cannot be changed. Everything already here stays
              exactly as it is.
            </Notice>
          )}
          <Notice tone="ok" icon="check" title="Added as you go, too">
            You never have to come here first. Recording an expense will have an{' '}
            <b>Add a new vendor</b> option at the bottom of the dropdown, and anything added
            that way appears in this list straight away.
          </Notice>
          <Notice icon="info" title="Archived, never deleted">
            A vendor attached to past expenses is archived rather than removed, so last
            year&apos;s entries keep the name they were filed under.
          </Notice>
        </div>
      </div>
    </section>
  );
}
