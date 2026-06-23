'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import styles from './Sidebar.module.css';

interface Props {
  active: 'overview' | 'funds' | 'stocks' | 'expenses' | 'analysis';
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
            href="/dashboard"
            className={active === 'overview' ? styles.navLinkActive : styles.navLink}
            aria-current={active === 'overview' ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
              <rect x="10.5" y="3" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
              <rect x="3" y="10.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
              <rect x="10.5" y="10.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Dashboard
          </Link>
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
            href="/stocks"
            className={active === 'stocks' ? styles.navLinkActive : styles.navLink}
            aria-current={active === 'stocks' ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 15.5V4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="5.5" y="10.5" width="2.4" height="5" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9.5" y="7" width="2.4" height="8.5" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
              <rect x="13.5" y="3.5" width="2.4" height="12" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Stocks
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
          <Link
            href="/expense-analysis"
            className={active === 'analysis' ? styles.navLinkActive : styles.navLink}
            aria-current={active === 'analysis' ? 'page' : undefined}
            onClick={() => setOpen(false)}
          >
            <svg className={styles.navIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 16.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="5" y="10.5" width="2.6" height="5" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
              <rect x="9.2" y="6.5" width="2.6" height="9" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
              <rect x="13.4" y="8.5" width="2.6" height="7" rx="0.4" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Expense Analysis
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
