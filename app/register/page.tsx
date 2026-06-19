'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error || 'Could not create account.');
      return;
    }

    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      router.push('/login');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.wordmarkBlock}>
          <h1 style={styles.wordmark}>Ledger</h1>
          <div style={styles.rule} />
          <div style={styles.ruleThin} />
          <p style={styles.tagline}>Open a new ledger for your holdings.</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Username
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label style={styles.label}>
            Display name <span style={styles.optional}>(optional)</span>
            <input
              style={styles.input}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label style={styles.label}>
            Confirm password
            <input
              style={styles.input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={styles.footer}>
          Already have an account? <Link href="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--paper)',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    background: 'var(--paper-raised)',
    border: '1px solid var(--hairline)',
    borderRadius: '4px',
    padding: '40px 36px',
  },
  wordmarkBlock: {
    marginBottom: '32px',
  },
  wordmark: {
    fontFamily: 'var(--font-display)',
    fontSize: '32px',
    fontWeight: 600,
    margin: 0,
    color: 'var(--ink)',
    letterSpacing: '-0.01em',
  },
  rule: {
    height: '2px',
    background: 'var(--ink)',
    width: '48px',
    marginTop: '12px',
  },
  ruleThin: {
    height: '1px',
    background: 'var(--ink)',
    width: '48px',
    marginTop: '3px',
  },
  tagline: {
    fontSize: '14px',
    color: 'var(--ink-soft)',
    marginTop: '14px',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '13px',
    color: 'var(--ink-soft)',
    fontWeight: 500,
  },
  optional: {
    color: 'var(--ink-faint)',
    fontWeight: 400,
  },
  input: {
    padding: '10px 12px',
    fontSize: '15px',
    border: '1px solid var(--hairline)',
    borderRadius: '3px',
    background: 'var(--paper)',
    color: 'var(--ink)',
  },
  error: {
    color: 'var(--brick)',
    fontSize: '13px',
    margin: 0,
  },
  button: {
    marginTop: '6px',
    padding: '11px',
    background: 'var(--ledger-green)',
    color: 'var(--paper-raised)',
    border: 'none',
    borderRadius: '3px',
    fontSize: '15px',
    fontWeight: 600,
  },
  footer: {
    marginTop: '24px',
    fontSize: '13px',
    color: 'var(--ink-faint)',
    textAlign: 'center',
  },
  link: {
    color: 'var(--ledger-green)',
    fontWeight: 600,
  },
};
