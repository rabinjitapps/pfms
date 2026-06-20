'use client';

import Link from 'next/link';
import styles from './PageNav.module.css';

export default function PageNav({ active }: { active: 'funds' | 'expenses' }) {
  return (
    <nav className={styles.nav} aria-label="Sections">
      <Link
        href="/"
        className={active === 'funds' ? styles.tabActive : styles.tab}
        aria-current={active === 'funds' ? 'page' : undefined}
      >
        Funds
      </Link>
      <Link
        href="/expenses"
        className={active === 'expenses' ? styles.tabActive : styles.tab}
        aria-current={active === 'expenses' ? 'page' : undefined}
      >
        Expenses
      </Link>
    </nav>
  );
}
