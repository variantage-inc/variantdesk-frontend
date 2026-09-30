'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './icon';
import { useSession } from '@/lib/session';
import { initials } from '@/lib/format';

/* The avatar in the top bar, and the few things a person does to their own
   account: settings, password, and signing out. Signing out ends the session
   on the server too; the auth guard then sends them to the sign in page. */
export function UserMenu() {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const staff = user?.platformRole === 'SUPERADMIN';
  const role = staff ? 'Superadmin' : user?.role === 'OWNER' ? 'Owner' : 'Member';

  const item = (href: string, icon: IconName, label: string) => (
    <Link role="menuitem" className="um-item" href={href} onClick={() => setOpen(false)}>
      <Icon name={icon} size={17} sw={1.9} />
      {label}
    </Link>
  );

  return (
    <div className="um" ref={ref}>
      <button
        type="button"
        className="who um-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="av">{initials(user?.firstName ?? '', user?.lastName ?? '')}</span>
        <span className="um-id">
          <span className="nm">
            {user?.firstName} {user?.lastName}
          </span>
          <br />
          <span className="bz">{role}</span>
        </span>
      </button>

      {open && (
        <div className="um-pop" role="menu">
          <div className="um-head">
            <b>
              {user?.firstName} {user?.lastName}
            </b>
            <span>{user?.email}</span>
          </div>
          <div className="um-list">
            {staff && item('/admin', 'shield', 'Superadmin panel')}
            {item('/settings', 'settings', 'Settings')}
            {item('/settings#security', 'lock', 'Password and security')}
          </div>
          <div className="um-list">
            <button
              type="button"
              role="menuitem"
              className="um-item um-out"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                await signOut('user');
              }}
            >
              <Icon name="logout" size={17} sw={1.9} />
              {leaving ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
