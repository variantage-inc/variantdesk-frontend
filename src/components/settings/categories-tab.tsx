'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  addCategory,
  archiveCategory,
  ApiError,
  listCategories,
  updateCategory,
  type Category,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { useToast } from './toast';

/* What an entry can be filed under.

   This tab acts immediately rather than collecting a draft, so it lends the
   page head no Save button. Adding a category is one small independent thing;
   making somebody press Save afterwards would be asking them to confirm a
   decision they have already made.

   Nothing here is ever deleted. A category attached to last year's entries has
   to keep existing for the CRA's six years, so the button archives it: gone
   from the dropdowns, still on last year's expenses. */

export function CategoriesTab() {
  const { access, user } = useSession();
  const toast = useToast();

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const canEdit = user?.role === 'OWNER' && access?.canWrite === true;

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((r) => !cancelled && setCategories(r.categories))
      .catch(() => !cancelled && toast('We could not load your categories.', 'err'));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function run(work: () => Promise<{ categories: Category[] }>, done: string) {
    setBusy(true);
    try {
      const r = await work();
      setCategories(r.categories);
      toast(done);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work. Try again.', 'err');
    } finally {
      setBusy(false);
    }
  }

  const group = (kind: Category['kind']) =>
    (categories ?? []).filter((c) => c.kind === kind && !c.archived);
  const archived = (categories ?? []).filter((c) => c.archived);

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Categories</h2>
              <p className="csub">
                What you can file an entry under. Edit the names, add your own, archive the ones
                you never use.
              </p>
            </div>
          </div>

          <div className="setbody">
            {!categories && <p className="hint">Loading…</p>}

            {categories && (
              <>
                <div className="setsec">
                  <h3>Expense categories</h3>
                  <p className="ssub">
                    What money going out is filed under. These are also how vendors are grouped.
                  </p>
                  <div className="rows">
                    {group('EXPENSE').map((c) => (
                      <Row
                        key={c.id}
                        category={c}
                        canEdit={canEdit}
                        busy={busy}
                        editing={editing === c.id}
                        editName={editName}
                        onEditStart={() => {
                          setEditing(c.id);
                          setEditName(c.name);
                        }}
                        onEditChange={setEditName}
                        onEditCancel={() => setEditing(null)}
                        onEditSave={() => {
                          setEditing(null);
                          void run(
                            () => updateCategory(c.id, { name: editName }),
                            'Category renamed.',
                          );
                        }}
                        onArchive={() =>
                          void run(() => archiveCategory(c.id), `${c.name} archived.`)
                        }
                      />
                    ))}
                  </div>

                  {canEdit && (
                    <div className="addrow">
                      <input
                        className="input"
                        placeholder="Add an expense category…"
                        value={adding}
                        onChange={(e) => setAdding(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' || !adding.trim()) return;
                          e.preventDefault();
                          void run(() => addCategory(adding.trim(), 'EXPENSE'), 'Category added.');
                          setAdding('');
                        }}
                      />
                      <button
                        className="btn"
                        type="button"
                        disabled={!adding.trim() || busy}
                        onClick={() => {
                          void run(() => addCategory(adding.trim(), 'EXPENSE'), 'Category added.');
                          setAdding('');
                        }}
                      >
                        <Icon name="plus" size={18} /> Add
                      </button>
                    </div>
                  )}
                </div>

                <div className="setsec">
                  <h3>Income categories</h3>
                  <p className="ssub">
                    How money coming in is filed. Most businesses need only a few.
                  </p>
                  <div className="rows">
                    {group('INCOME').map((c) => (
                      <Row
                        key={c.id}
                        category={c}
                        canEdit={canEdit}
                        busy={busy}
                        editing={editing === c.id}
                        editName={editName}
                        onEditStart={() => {
                          setEditing(c.id);
                          setEditName(c.name);
                        }}
                        onEditChange={setEditName}
                        onEditCancel={() => setEditing(null)}
                        onEditSave={() => {
                          setEditing(null);
                          void run(
                            () => updateCategory(c.id, { name: editName }),
                            'Category renamed.',
                          );
                        }}
                        onArchive={() =>
                          void run(() => archiveCategory(c.id), `${c.name} archived.`)
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="setsec">
                  <h3>Owner drawings</h3>
                  <p className="ssub">
                    Money you take out for yourself. This one cannot be edited or removed. The
                    rest of Variantage relies on it existing.
                  </p>
                  <div className="rows">
                    {group('DRAWINGS').map((c) => (
                      <div key={c.id} className="rowitem locked">
                        <span className="nm">{c.name}</span>
                        <span className="tag tag-lock">
                          <Icon name="lock" size={13} /> Built in
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {archived.length > 0 && (
                  <div className="setsec">
                    <h3>Archived</h3>
                    <p className="ssub">
                      Out of the dropdowns, still on every past entry that used them. Bring one
                      back at any time.
                    </p>
                    <div className="rows">
                      {archived.map((c) => (
                        <div key={c.id} className="rowitem" style={{ opacity: 0.7 }}>
                          <span className="nm">{c.name}</span>
                          <span className="ct">{c.kind === 'INCOME' ? 'Income' : 'Expense'}</span>
                          {canEdit && (
                            <button
                              className="btn btn-sm"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(
                                  () => updateCategory(c.id, { archived: false }),
                                  `${c.name} restored.`,
                                )
                              }
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rail">
          {!canEdit && (
            <Notice tone="warn" icon="lock" title="Read only">
              {user?.role === 'OWNER'
                ? 'Your trial has ended, so categories cannot be changed. Everything you already have stays exactly as it is.'
                : 'Only the account owner can change categories.'}
            </Notice>
          )}
          <Notice icon="wallet" title="Why Owner Drawings is locked">
            It is the category that keeps your profit honest. Anything filed under it is
            excluded from profit, from expense reports and from the tax you claim back, so it
            cannot be renamed into an ordinary expense by accident.
          </Notice>
          <Notice icon="info" title="Nothing is deleted, only archived">
            A category still attached to past entries is archived rather than removed. It
            disappears from the dropdowns, but last year&apos;s expenses keep their labels,
            which is what the CRA&apos;s six year rule requires.
          </Notice>
        </div>
      </div>
    </section>
  );
}

function Row({
  category,
  canEdit,
  busy,
  editing,
  editName,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSave,
  onArchive,
}: {
  category: Category;
  canEdit: boolean;
  busy: boolean;
  editing: boolean;
  editName: string;
  onEditStart: () => void;
  onEditChange: (next: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onArchive: () => void;
}) {
  if (editing) {
    return (
      <div className="rowitem">
        <input
          className="input"
          value={editName}
          autoFocus
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSave();
            if (e.key === 'Escape') onEditCancel();
          }}
        />
        <button className="btn btn-sm btn-primary" type="button" onClick={onEditSave}>
          Save
        </button>
        <button className="btn btn-sm" type="button" onClick={onEditCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="rowitem">
      <span className="nm">{category.name}</span>
      {category.vendorCount > 0 && (
        <span className="ct">
          {category.vendorCount} vendor{category.vendorCount === 1 ? '' : 's'}
        </span>
      )}
      {canEdit && (
        <span className="rowacts">
          <button type="button" aria-label={`Rename ${category.name}`} onClick={onEditStart}>
            <Icon name="edit" size={17} />
          </button>
          <button
            type="button"
            className="del"
            aria-label={`Archive ${category.name}`}
            disabled={busy}
            onClick={onArchive}
          >
            <Icon name="trash" size={17} />
          </button>
        </span>
      )}
    </div>
  );
}
