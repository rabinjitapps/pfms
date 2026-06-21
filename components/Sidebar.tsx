'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from './Sidebar.module.css';

interface Props {
  active: 'funds' | 'expenses';
  displayName: string;
}

export default function Sidebar({ active, displayName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — brand + hamburger. The sidebar itself becomes a
          slide-over drawer below this breakpoint. */}
      <div className={styles.mobileBar}>
        <span className={styles.mobileWordmark}>PFMS Tracker</span>
        <button
          className={styles.menuBtn}
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
        >
          <span className={styles.menuIcon} />
        </button>
      </div>

      {open && (
        <button
          className={styles.scrim}
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside className={open ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}>
        <div className={styles.brandBlock}>
          <span className={styles.eyebrow}>Ledger</span>
          <h1 className={styles.wordmark}>PFMS Tracker</h1>
        </div>

        <nav className={styles.nav} aria-label="Sections">
          <Link
            href="/"
            className={active === 'funds' ? styles.navLinkActive : styles.navLink}
            aria-current={active === 'funds' ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 13.5L7.5 9l3 3L17 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 6.5h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Funds
          </Link>
          <Link
            href="/expenses"
            className={active === 'expenses' ? styles.navLinkActive : styles.navLink}
            aria-current={active === 'expenses' ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="4.5" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 8.5h14" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6.5 11.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Expenses
          </Link>
        </nav>

        <div className={styles.footer}>
          <span className={styles.greeting}>{displayName}</span>
          <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
