'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Incorrect username or password.');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.wordmarkBlock}>
          <h1 style={styles.wordmark}>PFMS Tracker</h1>
          <div style={styles.rule} />
          <div style={styles.ruleThin} />
          <p style={styles.tagline}>A quiet place to keep your mutual fund holdings.</p>
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
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          New here? <Link href="/register" style={styles.link}>Create an account</Link>
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
